import tap from 'tap';
import JVC from '../index';

// I'm fully aware these aren't really proper tests. But they
// help me debug and in theory could be made into proper tests :)

process.on('uncaughtException', (error) => {
  // eslint-disable-next-line no-console
  console.error(error);
  process.exit(-1);
});

let jvc;

tap.test('connect', (t) => {
  // eslint-disable-next-line no-console
  jvc = new JVC(console, process.env.JVC_IP || 'theater-projector');
  jvc.connect();

  jvc.once('connected', () => {
    t.ok(true, 'Should connect to projector');
    t.end();
  });
});

tap.test('ready', (t) => {
  jvc.once('ready', () => {
    t.ok(true, 'Should get to ready state');
    t.end();
  });
});

tap.test('get power', (t) => {
  jvc.requestPowerState();
  jvc.once('response', (cmd, data) => {
    t.strictEquals(cmd, '5057', 'Expect response to power query');
    t.strictEquals(data.length, 2, 'Expect one byte back');
    t.end();
  });
});

tap.test('disconnect', (t) => {
  jvc.disconnect();
  t.ok(true, 'Should disconnect');
  t.end();
});
