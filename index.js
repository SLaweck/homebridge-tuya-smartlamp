const tuya = require('tuyapi');
// const debug = require('debug')('homebridge-tuya');

let Service, Characteristic;

module.exports = function(homebridge) {
  Service = homebridge.hap.Service;
  Characteristic = homebridge.hap.Characteristic;
  homebridge.registerAccessory("homebridge-tuya-smartlamp", "TuyaSmartLamp", TuyaSmartLamp);
}

function TuyaSmartLamp(log, config) {
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
    this.tuya = new tuya({ ip: config.ip, id: config.devId, key: config.localKey });
  }
  else {
    this.tuya = new tuya({ id: config.devId, key: config.localKey });
    setTimeout(() => {
      this.tuya.resolveId().then(resolve => {
        this.log('ResolveId: ' + resolve + (resolve ? ' Device IP: ' + this.tuya.device.ip : ''));
      }).catch(error => {
        this.log('ResolveId error: ' + error + ' [devId: ' + this.tuya.device.id + ']');
      });
    }, this.resolveDelay);
  }
}

TuyaSmartLamp.prototype.getSchema = function(callback) {
  const getSchema = (callback) => {
    // if we has actuak schema then return it
    if (this.fullSchema !== null) {
      // this.log('Cached schema return');
      callback(null, this.fullSchema);
      return;
    }
    // if not we query device
    this.tuya.get({ schema: true }).then(schema => {
      if (schema.devId && schema.dps && schema.dps['1'] !== undefined) {
        let dps = schema.dps;
        if (dps['5']) {
          dps = {1: dps['1'], 2: dps['2'], 3: dps['3'], 4: dps['4'], 5: dps['5']};
        }
        this.log('Device schema getted: ' + JSON.stringify(dps));
        // save the schema
        this.fullSchema = JSON.parse(JSON.stringify(schema));
        // clear saved schema after 5 second
        setTimeout(() => {
          this.fullSchema = null;
        }, 5000);
        // return schema
        callback(null, schema);
      } else {
        // if schema isn't full we return an error
        const  error = new Error('Error in getting schema ' + JSON.stringify(schema));
        this.log(error.message);
        callback(error, null);
      }
    }).catch(error => {
      // if catch error during query we return error
      this.log('Getting schema ' + error.message);
      callback(error, null);
    });
  };
  if (!this.tuya.device.ip) {
    // if device hasn't ip we resolveId
    this.tuya.resolveId().then(resolve => {
      this.log('ResolveId: ' + resolve + (resolve ? ' Device IP: ' + this.tuya.device.ip : ''));
      getSchema(callback);
    }).catch(error => {
      this.log('ResolveId error: ' + error + ' [devId: ' + this.tuya.device.id + ']');
      callback(error, null);
    });
  } else {
    getSchema(callback);
  }
};
TuyaSmartLamp.prototype.getDps = function(dps, callback) {
  let timeout = 0;
  if(!this.gettingSchema) {
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
};

TuyaSmartLamp.prototype.setDps = function(dps, value, callback) {
  const setDps = (dps, value, callback) => {
    this.tuya.set({ dps: dps, set: value }).then(status => {
      callback(null, status);
    }).catch(error => {
      callback(error, null);
    });
  };
  const setTimer = (dps, value, timeout, callback) => {
    setTimeout(() => {
      setDps(dps, value, callback);
    }, timeout);
  };
  let count = 5;
  const cb = (error, status) => {
    if (error || !status) {
      if (--count) {
        this.log('Retrying set dps: ' + error ? error : 'status fail');
        setTimer(dps, value, this.timeout, cb);
      } else {
        const e = error ? error : new Error('Set dps status fail');
        this.log('End of retrying set dps: ' + e.message);
        callback(e, null);
      }
    } else {
      setTimeout(() => {
        this.fullSchema = null;
        this.getDps(dps, (error, v) => {
          if (error) {
            if (--count) {
              this.log('Get dps error: ' + error.message + ', retrying set dps');
              setTimer(dps, value, this.timeout, cb);
            } else {
              this.log('End of retrying set dps, get dps error: ' + error.message);
              callback(error, null);
            }
          } else {
            if (v === value) {
              callback(null, true);
            } else {
              if (--count) {
                this.log('Dps isn\'t setting properly: set=' + value + ', get=' + v + ', retrying set dps');
                setTimer(dps, value, this.timeout, cb);
              } else {
                const e = new Error('Dps isn\'t setting properly: set=' + value + ', get=' + v + ', end of retrying set dps');
                this.log(e.message);
                callback(e, null);
              }
            }
          }
        });
      }, this.timeout);
    }
  };
  setTimer(dps, value, 1, cb);
};

TuyaSmartLamp.prototype.setOnStatus = function(on, callback) {
  this.setDps('1', on, (error, status) => {
    if (error) {
      this.log("Setting device " + (on ? "on" : "off"));
      return callback(error, null);
    } else {
      this.log("Set device " + (on ? "on" : "off"));
      return callback(null, status);
    }
  });
/*
  this.log("Setting device status to " + (on ? "on" : "off"));
  this.tuya.set({set: on}).then(status => {
    this.log("Device status set " + status);
    setTimeout(() => {
      return callback(null, status);
    }, this.timeout);
  }).catch(error => {
    return callback(error, null);
  });
*/
};

TuyaSmartLamp.prototype.getOnStatus = function(callback) {
  this.getDps('1', (error, status) => {
    if (error) {
      this.log("Getting device status " + error);
      return callback(error, null);
    } else {
      this.log("Device status is " + (status ? 'on' : 'off'));
      return callback(null, status);
    }
  });
};

TuyaSmartLamp.prototype.setBrightness = function(brightness, callback) {
  const bright = this.brightHome2Tuya(brightness);
  this.log("Setting device brightness " + brightness + " => " + bright);
  this.tuya.set({ dps: this.brightDps, set: bright }).then(status => {
    this.log("Device brightness set " + status);
    setTimeout(() => {
      return callback(null, status);
    }, this.timeout);
  }).catch(error => {
    callback(error, null);
  });
};

TuyaSmartLamp.prototype.getBrightness = function(callback) {
  this.getDps(this.brightDps, (error, bright) => {
    if (error) {
      this.log("Getting device brightness " + error);
      return callback(error, null);
    } else {
      const brightness = this.brightTuya2Home(bright);
      this.log("Device brightness is " + bright + " => " + brightness);
      return callback(null, brightness);
      }
  });
};

TuyaSmartLamp.prototype.brightTuya2Home = function(bright) {
  return Math.round(((bright - this.tuyaBrightMin) / this.tuyaBrightDelta) * this.brightnessDelta + this.brightnessMin);
};

TuyaSmartLamp.prototype.brightHome2Tuya = function(brightness) {
  return Math.round(((brightness - this.brightnessMin) / this.brightnessDelta) * this.tuyaBrightDelta + this.tuyaBrightMin);
};

TuyaSmartLamp.prototype.setTemperature = function(temperature, callback) {
  const temp = this.tempHome2Tuya(temperature);
  this.log("Setting device temperature " + temperature + " => " + temp);
  this.tuya.set({ dps: this.tempDps, set: temp }).then(status => {
    this.log("Device temperature set " + status);
    setTimeout(() => {
      return callback(null, status);
    }, this.timeout);
  }).catch(error => {
    callback(error, null);
  });
};

TuyaSmartLamp.prototype.getTemperature = function(callback) {
  this.getDps(this.tempDps, (error, temp) => {
    if (error) {
      this.log("Getting device temperature " + error);
      return callback(error, null);
    } else {
      const temperature = this.tempTuya2Home(temp);
      this.log("Device temperature is " + temp + " => " + temperature);
      return callback(null, temperature);
    }
  });
};

TuyaSmartLamp.prototype.tempTuya2Home = function(temp) {
  return Math.round(this.temperatureMax - ((temp - this.tuyaTempMin) / this.tuyaTempDelta) * this.temperatureDelta);
};

TuyaSmartLamp.prototype.tempHome2Tuya = function(temperature) {
  return Math.round(this.tuyaTempMax - ((temperature - this.temperatureMin) / this.temperatureDelta) * this.tuyaTempDelta);
};

TuyaSmartLamp.prototype.getServices = function() {
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
    this.log('Bulb is dimmable [min: ' + this.brightnessMin + ', max: ' + this.brightnessMax + ', delta: ' + this.brightnessDelta + ']');
    // console.dir(brightness);
    brightness.on('set', this.setBrightness.bind(this)).on('get', this.getBrightness.bind(this));
  }
  if (this.type && this.type.includes('tunable')) {
    const temperature = bulbService.getCharacteristic(Characteristic.ColorTemperature);
    this.temperatureMin = temperature.props.minValue;
    this.temperatureMax = temperature.props.maxValue;
    this.temperatureDelta = this.temperatureMax - this.temperatureMin;
    this.log('Bulb is tunable [min: ' + this.temperatureMin + ', max: ' + this.temperatureMax + ', delta: ' + this.temperatureDelta + ']');
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
};

TuyaSmartLamp.prototype.identify = function (callback) {
  this.log(this.config.name + " was identified.");
  callback();
};
