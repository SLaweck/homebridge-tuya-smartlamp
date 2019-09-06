// const Tuya = require('tuyapi');
const debug = require('debug')('TuyaSmartDevice');
const TuyaResolver = require('./lib/TuyaResolver');
const TuyaOutlet = require('./lib/TuyaOutlet');
const TuyaPowerStrip = require('./lib/TuyaPowerStrip');
const TuyaLightBulb = require('./lib/TuyaLightBulb');

// const TuyaAccessoryOld = require('./lib/TuyaAccessoryOld');

let homebridge;
let Service;
let Characteristic;
const resolver = new TuyaResolver();
// const tuyaAccessory = new TuyaAccessoryOld();

// eslint-disable-next-line no-unused-vars
const callbackify = (promise, callback) => {
  promise
    .then(result => callback(null, result))
    .catch(error => callback(error));
};


class TuyaSmartDevice {
  constructor(log, config) {
    debug('constructor');
    this.log = log;
    this.name = config.name;
    this.manufacturer = config.manufacturer || 'SLaweck - Tuya';
    this.model = config.model || 'Smart device';
    this.devId = config.devId;
    this.isLightbulb = config.type.includes('lightbulb');
    this.isOutlet = config.type.includes('outlet');
    this.isPowerstrip = config.type.includes('powerstrip');
    this.isTimer = config.type.includes('timersensor');
    this.interval = (config.interval || 30) * 1000;
    // this.isDimmable = config.type.includes('dimmable');
    // this.isTunable = config.type.includes('tunable');
    // this.brightMin = config.brightMin || 25;
    // this.brightMax = config.brightMax || 255;
    // this.brightDelta = this.brightMax - this.brightMin;
    // this.tempMin = config.tempMin || 0;
    // this.tempMax = config.tempMax || 255;
    // this.tempDelta = this.tempMax - this.tempMin;
    // this.informationService = null;
    // this.tuyaDeviceService = null;
    if (this.isOutlet) {
      this.tuyaDevice = new TuyaOutlet(config, resolver, log, homebridge);
    } else if (this.isPowerstrip) {
      this.tuyaDevice = new TuyaPowerStrip(config, resolver, log, homebridge);
    } else if (this.isLightbulb) {
      this.tuyaDevice = new TuyaLightBulb(config, resolver, log, homebridge);
    }
  }

  getServices() {
    let services;
    // if (this.isLightbulb) {
    //   debug('getServices lightbulb');
    //   services = [this.tuyaDevice.getInformationService(), ...this.tuyaDevice.getDeviceService()];
    // } else if (this.isOutlet) {
    //   debug('getServices outlet');
    //   services = [this.tuyaDevice.getInformationService(), ...this.tuyaDevice.getDeviceService()];
    // } else if (this.isPowerstrip) {
    //   debug('getServices powerstrip');
    //   services = [this.tuyaDevice.getInformationService(), ...this.tuyaDevice.getDeviceService()];
    // } else if (this.isTimer) {
      if (this.isTimer) {
      debug('getServices timer');
      services = [this.getTimerInfoService(), this.getTimerDeviceService()];
    } else {
      debug('getServices from Tuya device');
      services = [this.tuyaDevice.getInformationService(), ...this.tuyaDevice.getDeviceService()];
    }
    return services;
  }

  getTimerInfoService() {
    const timerInfoService = new Service.AccessoryInformation();

    timerInfoService
      .setCharacteristic(Characteristic.Manufacturer, this.manufacturer)
      .setCharacteristic(Characteristic.Model, this.model)
      .setCharacteristic(Characteristic.SerialNumber, this.devId.slice(0));

    return timerInfoService;
  }

  getTimerDeviceService() {
    const timerDeviceService = new Service.MotionSensor(this.name);

    let motion = false;
    const motionDetected = timerDeviceService.getCharacteristic(Characteristic.MotionDetected)
      .on('get', callback => callback(null, motion));

    setInterval(() => {
      motion = !motion;
      debug('Update motion detect', motion);
      motionDetected.updateValue(motion);
    }, this.interval);

    return timerDeviceService;
  }
}

module.exports = (hb) => {
  homebridge = hb;
  ({ Service } = homebridge.hap);
  ({ Characteristic } = homebridge.hap);
  homebridge.registerAccessory('homebridge-tuya-smartdevice', 'TuyaSmartDevice', TuyaSmartDevice);
  // eslint-disable-next-line global-require
  // const TuyaPlatform = require('./lib/TuyaPlatform')(homebridge);
  // homebridge.registerPlatform('homebridge-tuya-platform', 'TuyaPlatform', TuyaPlatform, true);
};
