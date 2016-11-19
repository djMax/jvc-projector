import { EventEmitter } from 'events';
import net from 'net';

// JVC Projector Shim for HomeBridge
//
// Remember to add platform to config.json. Example:
// 'platforms': [
//     {
//         'platform': 'jvc',             // required
//         'name': 'jvc',                 // required
//     }
// ],
//
// When you attempt to add a device, it will ask for a 'PIN code'.
// The default code for all HomeBridge accessories is 031-45-154.
//

const MESSAGE_RECEIVED = 'messageReceived';

const priv = Symbol();
let Service;
let Characteristic;

function incomingData(context, str) {

}

let dogs = 0;

/**
 * Make sure fn gets called exactly once after no more than maxTime
 */
function watchDog(name, maxTime, context, fn) {
  const start = Date.now();
  dogs++;
  let wasDone = false;
  setTimeout(() => {
    if (!wasDone) {
      wasDone = true;
      dogs--;
      context.log(`${name} watch dog kicked after ${maxTime} (${dogs})`);
      fn();
    }
  }, maxTime);
  return (...cbArgs) => {
    const time = Date.now() - start;
    if (!wasDone) {
      wasDone = true;
      dogs--;
      context.log(`${name} completed in ${time}ms (${dogs})`);
      fn(...cbArgs);
    } else {
      context.log(`${name} callback took too long ${time}ms (${dogs})`);
    }
  };
}

export default class JVC extends EventEmitter {
  constructor(logger, ip, port) {
    super();
    this.logger = logger;
    this.ip = ip;
    this.socket = new net.Socket();
    this.socket.on('error', (e) => {
      logger.error('Socket error', e);
    });
    this.socket.on('data', (d) => this.received(d));
  }

  received(d) {
    if (d.length === 0) {
      return;
    }
    if (!this.acked) {
      console.log('DATA', d.toString());
      if (d.toString('utf8') === 'PJ_OK') {
        this.socket.write(Buffer.from('PJREQ'));
      } else if (d.toString('utf8') === 'PJACK') {
        this.acked = true;
        this.emit('ready');
      }
    } else {
      let fullMessage = this.partial ? Buffer.concat([this.partial, d]) : d;
      console.error('DATA IN', fullMessage.toString('hex'));
      delete this.partial;
      const endOf = fullMessage.indexOf(0x0A);
      if (endOf < 0) {
        this.logger.info('Partial message received', { message: fullMessage.toString('hex') });
        this.partial = fullMessage;
      } else {
        const thisMessage = fullMessage.slice(0, endOf);
        this.messageReceived(thisMessage);
        if (endOf < fullMessage.length) {
          this.received(fullMessage.slice(endOf + 1));
        }
      }
    }
  }

  messageReceived(message) {
    const [ header, id1, id2, cmd1, cmd2, ...data] = message;
    if (message[0] === 0x06) {
      this.emit('ack', message.slice(3,5), message.slice(6));
    } else if (message[0] === 0x40) {
      this.emit('response', message.slice(3,5).toString('hex'), message.slice(5).toString('hex'));
    } else {
      this.logger.error('Failed to parse packet')
      this.emit('unknown', message);
    }
  }

  requestPowerState() {
    this.socket.write(Buffer.from([
      0x3F, 0x89, 0x01, 0x50, 0x57, 0x0A,
    ]));
  }

  requestInputState() {
    this.socket.write(Buffer.from([
      0x3F, 0x89, 0x01, 0x49, 0x50, 0x0A,
    ]));
  }

  setPowerState(on) {
    this.socket.write(Buffer.from([
      0x3F, 0x89, 0x01, 0x50, 0x57, on ? 0x31 : 0x30, 0x0A,
    ]));
  }

  setInputState(hdmi1) {
    this.socket.write(Buffer.from([
      0x3F, 0x89, 0x01, 0x49, 0x50, hdmi1 ? 0x36 : 0x37, 0x0A,
    ]));    
  }

  async connect() {
    return await new Promise((accept, reject) => {
      this.socket.connect({
        host: this.ip,
        port: this.port || 20554,
      }, () => {
        this.emit('connected');
        accept();
      });
    });
  }

  disconnect() {
    this.shuttingDown = true;
    this.socket.end();
  }
}
