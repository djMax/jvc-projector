import { EventEmitter } from 'events';
import net from 'net';

export default class JVC extends EventEmitter {
  constructor(logger, ip, port) {
    super();
    this.logger = logger;
    this.ip = ip;
    this.port = port;
  }

  received(d) {
    if (d.length === 0) {
      return;
    }
    if (!this.acked) {
      if (d.toString('utf8') === 'PJ_OK') {
        this.socket.write(Buffer.from('PJREQ'));
      } else if (d.toString('utf8') === 'PJACK') {
        this.acked = true;
        this.emit('ready');
      }
    } else {
      const fullMessage = this.partial ? Buffer.concat([this.partial, d]) : d;
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
    const header = message[0];
    if (header === 0x06) {
      this.emit('ack', message.slice(3, 5), message.slice(6));
    } else if (header === 0x40) {
      this.emit('response', message.slice(3, 5).toString('hex'), message.slice(5).toString('hex'));
    } else {
      this.logger.error('Failed to parse packet');
      this.emit('unknown', message);
    }
  }

  async write(d) {
    if (!this.socket) {
      await this.connect();
    }
    this.socket.write(d);
  }

  requestPowerState() {
    this.write(Buffer.from([
      0x3F, 0x89, 0x01, 0x50, 0x57, 0x0A,
    ]));
  }

  requestInputState() {
    this.write(Buffer.from([
      0x3F, 0x89, 0x01, 0x49, 0x50, 0x0A,
    ]));
  }

  setPowerState(on) {
    this.write(Buffer.from([
      0x21, 0x89, 0x01, 0x50, 0x57, on ? 0x31 : 0x30, 0x0A,
    ]));
  }

  setInputState(hdmi1) {
    this.write(Buffer.from([
      0x21, 0x89, 0x01, 0x49, 0x50, hdmi1 ? 0x36 : 0x37, 0x0A,
    ]));
  }

  async connect() {
    return await new Promise((accept) => {
      this.logger.info('Connecting to JVC projector');
      this.socket = new net.Socket();
      this.socket.on('error', (e) => {
        this.logger.error('Socket error', e);
      });
      this.socket.on('close', () => {
        this.logger.info('Socket closed');
        this.socket.removeAllListeners();
        delete this.socket;
      });
      this.socket.on('data', (d) => this.received(d));
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
    this.socket.removeAllListeners();
    delete this.socket;
  }
}
