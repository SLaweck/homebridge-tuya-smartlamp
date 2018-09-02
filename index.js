// const Tuya = require('tuyapi');
const debug = require('debug')('TuyaSmartDevice');
const TuyaAccessory = require('./lib/TuyaAccessory');

let homeBridge;
let Service;
let Characteristic;
const tuyaAccessory = new TuyaAccessory();

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
    if (!this.isTimer) {
      this.tuyaDevice = tuyaAccessory.addDevice(log, config, homeBridge);
    }
  }

  getServices() {
    let services;
    if (this.isLightbulb) {
      debug('getServices lightbulb');
      services = [this.tuyaDevice.getInformationService(), ...this.tuyaDevice.getDeviceService()];
    } else if (this.isOutlet) {
      debug('getServices outlet');
      services = [this.tuyaDevice.getInformationService(), ...this.tuyaDevice.getDeviceService()];
    } else if (this.isTimer) {
      debug('getServices timer');
      services = [this.getTimerInfoService(), this.getTimerDevService()];
    } else {
      debug('getServices switch/other');
      services = [this.getInformationService(), this.getTuyaDeviceService()];
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

  getTimerDevService() {
    const timerDevService = new Service.MotionSensor(this.name);

    let motion = false;
    const motionDetected = timerDevService.getCharacteristic(Characteristic.MotionDetected)
      .on('get', callback => callback(null, motion));

    setInterval(() => {
      motion = !motion;
      debug('Update motion detect', motion);
      motionDetected.updateValue(motion);
    }, this.interval);

    return timerDevService;
  }

/*
  identify(callback) {
    this.log(`Identify ${this.name}`);
    const getBlinkCb = (onOff, cb) => (error, status) => {
      if (!error && status) {
        setTimeout(() => {
          this.setOnOffStatus(onOff, cb || (() => {}));
        }, 400);
      }
    };
    this.getOnOffStatus((error, onOff) => {
      if (!error) {
        const endBlink = getBlinkCb(onOff, null);
        const blink4 = getBlinkCb(!onOff, endBlink);
        const blink3 = getBlinkCb(onOff, blink4);
        const blink2 = getBlinkCb(!onOff, blink3);
        const blink1 = getBlinkCb(onOff, blink2);
        this.setOnOffStatus(!onOff, blink1);
      }
    });
    callback();
  }

  getInformationService() {
    if (this.informationService != null) {
      return this.informationService;
    }

    const informationService = new Service.AccessoryInformation();

    informationService
      .setCharacteristic(Characteristic.Manufacturer, this.manufacturer)
      .setCharacteristic(Characteristic.Model, this.model)
      .setCharacteristic(Characteristic.SerialNumber, this.devId.slice(8));

    this.informationService = informationService;
    return informationService;
  }

  getTuyaDeviceService() {
    if (this.tuyaDeviceService != null) {
      return this.tuyaDeviceService;
    }

    const tuyaDeviceService = this.isLightbulb ? new Service.Lightbulb(this.name) : new Service.Switch(this.name);

    tuyaDeviceService.getCharacteristic(Characteristic.On)
      .on('get', this.getOnOffStatus.bind(this))
      .on('set', this.setOnOffStatus.bind(this));

    if (this.isLightbulb && this.isDimmable) {
      const brightness = tuyaDeviceService.getCharacteristic(Characteristic.Brightness)
        .on('get', this.getBrightness.bind(this))
        .on('set', this.setBrightness.bind(this));
      this.brightnessMin = brightness.props.minValue + brightness.props.minStep;
      this.brightnessMax = brightness.props.maxValue;
      this.brightnessDelta = this.brightnessMax - this.brightnessMin;
    }

    if (this.isLightbulb && this.isTunable) {
      const temperature = tuyaDeviceService.getCharacteristic(Characteristic.ColorTemperature)
        .on('get', this.getTemperature.bind(this))
        .on('set', this.setTemperature.bind(this));
      this.temperatureMin = temperature.props.minValue;
      this.temperatureMax = temperature.props.maxValue;
      this.temperatureDelta = this.temperatureMax - this.temperatureMin;
    }

    this.tuyaDeviceService = tuyaDeviceService;
    return tuyaDeviceService;
  }

  getOnOffStatus(callback) {
    this.log('Get device on/off status');
    callbackify(tuyaAccessory.getOnOff(this.devId), callback);
  }

  setOnOffStatus(onOff, callback) {
    this.log('Set device on/off status');
    callbackify(tuyaAccessory.setOnOff(this.devId, onOff), callback);
  }

  getBrightness(callback) {
    this.log('Get device brightness');
    tuyaAccessory.getBright(this.devId)
      .then(bright => callback(null, this.brightTuya2Home(bright)))
      .catch(error => callback(error));
  }

  setBrightness(brightness, callback) {
    const bright = this.brightHome2Tuya(brightness);
    this.log('Set device brightness', bright);
    callbackify(tuyaAccessory.setBright(this.devId, bright), callback);
  }

  brightTuya2Home(bright) {
    const brightness = Math.round(((bright - this.brightMin) / this.brightDelta) * this.brightnessDelta + this.brightnessMin);
    this.log('Convert brightness Tuya', bright, '=> HomeKit', brightness);
    return brightness;
  }

  brightHome2Tuya(brightness) {
    const bright = Math.round(((brightness - this.brightnessMin) / this.brightnessDelta) * this.brightDelta + this.brightMin);
    this.log('Convert brightness HomeKit', brightness, '=> Tuya', bright);
    return bright;
  }

  getTemperature(callback) {
    this.log('Get device temperature');
    tuyaAccessory.getTemp(this.devId)
      .then(temp => callback(null, this.tempTuya2Home(temp)))
      .catch(error => callback(error));
  }

  setTemperature(temperature, callback) {
    const temp = this.tempHome2Tuya(temperature);
    this.log('Set device temperature', temperature);
    callbackify(tuyaAccessory.setTemp(this.devId, temp), callback);
  }

  tempTuya2Home(temp) {
    const temperature = Math.round(this.temperatureMax - ((temp - this.tempMin) / this.tempDelta) * this.temperatureDelta);
    this.log('Convert color temperature Tuya', temp, '=> HomeKit', temperature);
    return temperature;
  }

  tempHome2Tuya(temperature) {
    const temp = Math.round(this.tempMax - ((temperature - this.temperatureMin) / this.temperatureDelta) * this.tempDelta);
    this.log('Convert color temperature HomeKit', temperature, ' => Tuya', temp);
    return temp;
  }
*/
}

module.exports = (homebridge) => {
  homeBridge = homebridge;
  ({ Service } = homebridge.hap);
  ({ Characteristic } = homebridge.hap);
  homebridge.registerAccessory('homebridge-tuya-smartdevice', 'TuyaSmartDevice', TuyaSmartDevice);
  // eslint-disable-next-line global-require
  // const TuyaPlatform = require('./lib/TuyaPlatform')(homebridge);
  // homebridge.registerPlatform('homebridge-tuya-platform', 'TuyaPlatform', TuyaPlatform, true);
};
