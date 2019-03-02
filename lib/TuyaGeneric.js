const debug = require('debug')('TuyaGeneric');


let logError;


class TuyaGeneric {
  constructor(tuyaAccessory, config, homebridge) {
    debug('constructor', config);
    // primary objects and logging/debug function
    this.tuya = tuyaAccessory;
    this.tuyaDev = this.tuya.getDev(config.devId);
    this.log = this.tuyaDev.log;
    if (config.logErrors) {
      logError = this.log && this.log.error ? (...args) => this.log.error('[TG]', ...args) : debug;
    } else {
      logError = debug;
    }
    // homebridge API
    this.homebridge = homebridge;
    this.Service = homebridge ? homebridge.hap.Service : null;
    this.Characteristic = homebridge ? homebridge.hap.Characteristic : null;
    // handling config parameters
    this.config = config;
    this.devId = config.devId;
    this.name = config.name || `Tuya Generic ${config.devId.slice(-4)}`;
    this.dpsOnOff = 1;
    debug('constructor end - logError', logError);
  }

  getOnOff(callback = () => {}) {
    this.tuya.getProperty(this.devId, this.dpsOnOff)
      .then((onOff) => {
        debug(this.name, 'is', onOff ? 'on' : 'off');
        callback(null, onOff);
      })
      .catch((error) => {
        logError(this.name, 'getting on/off status error', error.message);
        callback(error);
      });
  }

  setOnOff(onOff, callback = () => {}) {
    this.tuya.setProperty(this.devId, this.dpsOnOff, onOff)
      .then((result) => {
        debug(this.name, 'set', onOff ? 'on' : 'off', result ? 'success' : 'fail');
        callback(null, result);
      })
      .catch((error) => {
        logError(this.name, 'setting turn', onOff ? 'on' : 'off', 'error', error.message);
        callback(error);
      });
  }
}

module.exports = TuyaGeneric;
