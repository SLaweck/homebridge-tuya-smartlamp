const Tuya = require('tuyapi');
const TuyaAccessory = require('./lib/TuyaAccessory');
// const debug = require('debug')('homebridge-tuya');

let Service;
let Characteristic;
const tuyaAccessory = new TuyaAccessory(null, { devices: [] });

class TuyaSmartLamp {
  constructor(log, config) {
    this.log = log;
    this.name = config.name;
    this.type = config.type;
    this.timeout = config.waitOnSet || 50;
    this.tuyaBrightMin = config.brightMin || 25;
    this.tuyaBrightMax = config.brightMax || 255;
    this.tuyaBrightDelta = this.tuyaBrightMax - this.tuyaBrightMin;
    this.tuyaTempMin = config.tempMin || 0;
    this.tuyaTempMax = config.tempMax || 255;
    this.tuyaTempDelta = this.tuyaTempMax - this.tuyaTempMin;
    this.resolveDelay = config.delay || 0;
    this.mode = null;
    this.brightDps = '2';
    this.tempDps = '3';
    this.fullSchema = null;
    this.gettingSchema = false;
    if (config.ip !== undefined) {
      this.tuya = new Tuya({ ip: config.ip, id: config.devId, key: config.localKey });
    } else {
      this.tuya = new Tuya({ id: config.devId, key: config.localKey });
      setTimeout(() => {
        this.tuya.resolveId().then((resolve) => {
          this.log(`ResolveId: ${resolve} ${resolve ? `Device IP: ${this.tuya.device.ip}` : ''}`);
        }).catch((error) => {
          this.log(`ResolveId error: ${error} [devId: ${this.tuya.device.id}]`);
        });
      }, this.resolveDelay);
    }
  }

  getSchema(callback) {
    const getSchema = (cb) => {
      // if we has actuak schema then return it
      if (this.fullSchema !== null) {
        // this.log('Cached schema return');
        cb(null, this.fullSchema);
        return;
      }
      // if not we query device
      this.tuya.get({ schema: true }).then((schema) => {
        if (schema.devId && schema.dps && schema.dps['1'] !== undefined) {
          let d = schema.dps;
          if (d['5']) {
            d = {
              1: d['1'], 2: d['2'], 3: d['3'], 4: d['4'], 5: d['5'],
            };
          }
          this.log(`Device schema getted: ${JSON.stringify(d)}`);
          // save the schema
          this.fullSchema = JSON.parse(JSON.stringify(schema));
          // clear saved schema after 5 second
          setTimeout(() => {
            this.fullSchema = null;
          }, 5000);
          // return schema
          cb(null, schema);
        } else {
          // if schema isn't full we return an error
          const error = new Error(`Error in getting schema ${JSON.stringify(schema)}`);
          this.log(error.message);
          cb(error, null);
        }
      }).catch((error) => {
        // if catch error during query we return error
        this.log(`Getting schema ${error.message}`);
        cb(error, null);
      });
    };
    if (!this.tuya.device.ip) {
      // if device hasn't ip we resolveId
      this.tuya.resolveId().then((resolve) => {
        this.log(`ResolveId: ${resolve}${resolve ? ` Device IP: ${this.tuya.device.ip}` : ''}`);
        getSchema(callback);
      }).catch((error) => {
        this.log(`ResolveId error: ${error} [devId: ${this.tuya.device.id}]`);
        callback(error, null);
      });
    } else {
      getSchema(callback);
    }
  }

  getDps(dps, callback) {
    let timeout = 0;
    if (!this.gettingSchema) {
      // this.log('Schema not getting');
      this.gettingSchema = true;
    } else {
      // this.log('Schema getting');
      timeout = this.timeout * 10;
      if (timeout < 400) {
        timeout = 400;
      }
    }
    setTimeout(() => {
      this.getSchema((error, schema) => {
        if (error) {
          callback(error, null);
        } else {
          callback(null, schema.dps[dps]);
        }
        this.gettingSchema = false;
      });
    }, timeout);
  }

  setDps(dps, value, callback) {
    const setDps = (d, val, cb) => {
      this.tuya.set({ dps: d, set: val }).then((status) => {
        cb(null, status);
      }).catch((error) => {
        cb(error, null);
      });
    };
    const setTimer = (d, val, timeout, cb) => {
      setTimeout(() => {
        setDps(d, val, cb);
      }, timeout);
    };
    let count = 5;
    const cb = (error, status) => {
      if (error || !status) {
        if (--count) {
          this.log(`Retrying set dps: ${error ? error.message : 'status fail'}`);
          setTimer(dps, value, this.timeout, cb);
        } else {
          const e = error || new Error('Set dps status fail');
          this.log(`End of retrying set dps: ${e.message}`);
          callback(e, null);
        }
      } else {
        setTimeout(() => {
          this.fullSchema = null;
          this.getDps(dps, (err, val) => {
            if (err) {
              if (--count) {
                this.log(`Get dps error: ${err.message}, retrying set dps`);
                setTimer(dps, value, this.timeout, cb);
              } else {
                this.log(`End of retrying set dps, get dps error: ${err.message}`);
                callback(err, null);
              }
            } else if (val === value) {
              callback(null, true);
            } else if (--count) {
              this.log(`Dps isn't setting properly: set=${value}, get=${val}, retrying set dps`);
              setTimer(dps, value, this.timeout, cb);
            } else {
              const e = new Error(`Dps isn't setting properly: set=${value}, get=${val}, end of retrying set dps`);
              this.log(e.message);
              callback(e, null);
            }
          });
        }, this.timeout);
      }
    };
    setTimer(dps, value, 1, cb);
  }

  setOnStatus(on, callback) {
    this.setDps('1', on, (error, status) => {
      const st = (error ? null : status);
      if (error) {
        this.log(`Setting device ${on ? 'on' : 'off'}`);
      } else {
        this.log(`Set device ${on ? 'on' : 'off'}`);
      }
      return callback(error, st);
    });
  }

  getOnStatus(callback) {
    this.getDps('1', (error, status) => {
      const st = (error ? null : status);
      if (error) {
        this.log(`Getting device status ${error}`);
      } else {
        this.log(`Device status is ${status ? 'on' : 'off'}`);
      }
      return callback(error, st);
    });
  }

  setBrightness(brightness, callback) {
    const bright = this.brightHome2Tuya(brightness);
    this.log(`Setting device brightness ${brightness} => ${bright}`);
    this.tuya.set({ dps: this.brightDps, set: bright }).then((status) => {
      this.log(`Device brightness set ${status}`);
      setTimeout(() => callback(null, status), this.timeout);
    }).catch((error) => {
      callback(error, null);
    });
  }

  getBrightness(callback) {
    this.getDps(this.brightDps, (error, bright) => {
      let brightness;
      if (error) {
        this.log(`Getting device brightness ${error}`);
      } else {
        brightness = this.brightTuya2Home(bright);
        this.log(`Device brightness is ${bright} => ${brightness}`);
      }
      return callback(error, brightness);
    });
  }

  brightTuya2Home(bright) {
    return Math.round(((bright - this.tuyaBrightMin) / this.tuyaBrightDelta) * this.brightnessDelta + this.brightnessMin);
  }

  brightHome2Tuya(brightness) {
    return Math.round(((brightness - this.brightnessMin) / this.brightnessDelta) * this.tuyaBrightDelta + this.tuyaBrightMin);
  }

  setTemperature(temperature, callback) {
    const temp = this.tempHome2Tuya(temperature);
    this.log(`Setting device temperature ${temperature} => ${temp}`);
    this.tuya.set({ dps: this.tempDps, set: temp }).then((status) => {
      this.log(`Device temperature set ${status}`);
      setTimeout(() => callback(null, status), this.timeout);
    }).catch((error) => {
      callback(error, null);
    });
  }

  getTemperature(callback) {
    this.getDps(this.tempDps, (error, temp) => {
      let temperature;
      if (error) {
        this.log(`Getting device temperature ${error}`);
      } else {
        temperature = this.tempTuya2Home(temp);
        this.log(`Device temperature is ${temp} => ${temperature}`);
      }
      return callback(error, temperature);
    });
  }

  tempTuya2Home(temp) {
    return Math.round(this.temperatureMax - ((temp - this.tuyaTempMin) / this.tuyaTempDelta) * this.temperatureDelta);
  }

  tempHome2Tuya(temperature) {
    return Math.round(this.tuyaTempMax - ((temperature - this.temperatureMin) / this.temperatureDelta) * this.tuyaTempDelta);
  }

  getServices() {
    // Setup the HAP services
    const informationService = new Service.AccessoryInformation();
    informationService
      .setCharacteristic(Characteristic.Manufacturer, 'Tuya - SLaweck')
      .setCharacteristic(Characteristic.Model, 'Led-Smart-Lamp')
      .setCharacteristic(Characteristic.SerialNumber, this.devId);
    const bulbService = new Service.Lightbulb(this.name);
    bulbService.getCharacteristic(Characteristic.On)
      .on('set', this.setOnStatus.bind(this))
      .on('get', this.getOnStatus.bind(this));
    if (this.type && this.type.includes('dimmable')) {
      const brightness = bulbService.getCharacteristic(Characteristic.Brightness);
      this.brightnessMin = brightness.props.minValue + brightness.props.minStep;
      this.brightnessMax = brightness.props.maxValue;
      this.brightnessDelta = this.brightnessMax - this.brightnessMin;
      this.log(`Bulb is dimmable [min: ${this.brightnessMin}, max: ${this.brightnessMax}, delta: ${this.brightnessDelta}]`);
      // console.dir(brightness);
      brightness.on('set', this.setBrightness.bind(this)).on('get', this.getBrightness.bind(this));
    }
    if (this.type && this.type.includes('tunable')) {
      const temperature = bulbService.getCharacteristic(Characteristic.ColorTemperature);
      this.temperatureMin = temperature.props.minValue;
      this.temperatureMax = temperature.props.maxValue;
      this.temperatureDelta = this.temperatureMax - this.temperatureMin;
      this.log(`Bulb is tunable [min: ${this.temperatureMin}, max: ${this.temperatureMax}, delta: ${this.temperatureDelta}]`);
      temperature.on('set', this.setTemperature.bind(this)).on('get', this.getTemperature.bind(this));
    }
    if (this.type && this.type.includes('color')) {
      this.log('Bulb is color');
      this.mode = 'white';
      this.brightDps = '3';
      this.tempDps = '4';
    } else {
      this.log('Bulb isn\'t color');
      this.brightDps = '2';
      this.tempDps = '3';
    }
    return [informationService, bulbService];
  }

  identify(callback) {
    this.log(`${this.config.name} was identified.`);
    callback();
  }
}

const callbackify = (promise, callback) => {
  promise
    .then(result => callback(null, result))
    .catch(error => callback(error));
};


class TuyaSmartDevice {
  constructor(log, config) {
    this.log = log;
    this.name = config.name;
    this.manufacturer = config.manufacturer || 'SLaweck - Tuya';
    this.model = config.model || 'Smart device';
    this.devId = config.devId;
    this.productId = config.productId;
    this.isLightbulb = config.type.includes('lightbulb');
    this.isDimmable = config.type.includes('dimmable');
    this.isTunable = config.type.includes('tunable');
    this.brightMin = config.brightMin || 25;
    this.brightMax = config.brightMax || 255;
    this.tempMin = config.tempMin || 0;
    this.tempMax = config.tempMax || 255;
    this.tempDelta = this.tempMax - this.tempMin;
    this.informationService = null;
    this.tuyaDeviceService = null;
    tuyaAccessory.addDevice(log, config);
  }

  getServices() {
    return [this.getInformationService(), this.getTuyaDeviceService()];
  }

  getInformationService() {
    if (this.informationService != null) {
      return this.informationService;
    }

    const informationService = new Service.AccessoryInformation();

    informationService
      .setCharacteristic(Characteristic.Manufacturer, this.manufacturer)
      .setCharacteristic(Characteristic.Model, this.model)
      .setCharacteristic(Characteristic.SerialNumber, this.productId);

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
    const bright = this.brightTuya2Home(brightness);
    this.log('Set device brightness', bright);
    callbackify(tuyaAccessory.setBright(this.devId, bright), callback);
  }

  brightTuya2Home(bright) {
    return Math.round(((bright - this.brightMin) / this.brightDelta) * this.brightnessDelta + this.brightnessMin);
  }

  brightHome2Tuya(brightness) {
    return Math.round(((brightness - this.brightnessMin) / this.brightnessDelta) * this.brightDelta + this.brightMin);
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
    this.log('Convert Tuya', temp, '=> HomeKit', temperature);
    return temperature;
  }

  tempHome2Tuya(temperature) {
    const temp = Math.round(this.tempMax - ((temperature - this.temperatureMin) / this.temperatureDelta) * this.tempDelta);
    this.log('Convert HomeKit', temperature, ' => Tuya', temp);
    return temp;
  }
}

module.exports = (homebridge) => {
  ({ Service } = homebridge.hap);
  ({ Characteristic } = homebridge.hap);
  homebridge.registerAccessory('homebridge-tuya-smartlamp', 'TuyaSmartLamp', TuyaSmartLamp);
  homebridge.registerAccessory('homebridge-tuya-smartdevice', 'TuyaSmartDevice', TuyaSmartDevice);
  // eslint-disable-next-line global-require
  // const TuyaPlatform = require('./lib/TuyaPlatform')(homebridge);
  // homebridge.registerPlatform('homebridge-tuya-platform', 'TuyaPlatform', TuyaPlatform, true);
};
