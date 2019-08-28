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
    this.switchNames = [...config.switchNames];
    this.switchDPSs = [...config.switchDPSs];
    debug('constructor end - logError', logError);
  }

  getInformationService() {
    debug('getInformationService');
    if (this.informationService != null) {
      return this.informationService;
    }

    const informationService = new this.Service.AccessoryInformation();

    informationService
      .setCharacteristic(this.Characteristic.Manufacturer, this.config.manufacturer)
      .setCharacteristic(this.Characteristic.Model, this.config.model)
      .setCharacteristic(this.Characteristic.SerialNumber, this.config.devId.slice(8));

    this.informationService = informationService;
    return informationService;
  }

  getDeviceService() {
    debug('getDeviceService');
    if (this.deviceServices != null) {
      return this.deviceServices;
    }

    this.deviceServices = [];

    for (let i = 0; i < this.switchNames.length && i < this.switchDPSs.length; i++) {
      const name = this.switchNames[i];
      const dps = this.switchDPSs[i];

      const deviceService = new this.Service.Switch(this.name + ' ' + name, name);
      const onCharacteristic = deviceService.getCharacteristic(this.Characteristic.On)
        .on('get', callback => this.getOnOff(dps, callback))
        .on('set', (onOff, callback) => this.setOnOff(dps, onOff, callback));

      this.deviceServices.push(deviceService);
    }

    return this.deviceServices;
  }


  getOnOff(dps, callback = () => {}) {
    this.tuya.getProperty(this.devId, dps)
      .then((onOff) => {
        debug(this.name, 'is', onOff ? 'on' : 'off');
        callback(null, onOff);
      })
      .catch((error) => {
        logError(this.name, 'getting on/off status error', error.message);
        callback(error);
      });
  }

  setOnOff(dps, onOff, callback = () => {}) {
    this.tuya.setProperty(this.devId, dps, onOff)
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
