const { Subject } = require('rxjs');
const { debounceTime } = require('rxjs/operators');
const debug = require('debug')('TuyaLightBulb');

const kModeWhite = 'white';
const kModeColor = 'colour'; // dps 5 - RRGGBB + '0000ffff'
const kModeScene = 'scene'; // Night, Reading, Party, Leisure, dps 6, stable color - RRGGBB + '0168ffff'
const kModeScene1 = 'scene_1'; // Soft, dps 7, colors 1, smooth color fading - 'ffff' + SS + '01' + RRGGBB
const kModeScene2 = 'scene_2'; // Rainbow, dps 8, colors 6, change of kolors - 'ffff' + SS + CC + RRGGBB + ... + RRGGBB
const kModeScene3 = 'scene_3'; // Shine, dps 9, colors 1, flashing color - 'ffff' + SS + '01' + RRGGBB
const kModeScene4 = 'scene_4'; // Gorgeaous, dps 10, colors 6, smooth change of colors - 'ffff' + SS + CC + RRGGBB + ... + RRGGBB
const kModeScenes = [kModeScene, kModeScene1, kModeScene2, kModeScene3, kModeScene4];

class TuyaLightBulb {
  constructor(tuyaAccessory, config, homebridge) {
    debug('constructor', config);
    this.tuya = tuyaAccessory;
    this.tuyaDev = this.tuya.getDev(config.devId);
    this.config = config;
    this.homebridge = homebridge;
    this.Service = homebridge ? homebridge.hap.Service : null;
    this.Characteristic = homebridge ? homebridge.hap.Characteristic : null;
    this.devId = config.devId;
    this.name = config.name;
    this.isDimmable = config.type.includes('dimmable');
    this.isTunable = config.type.includes('tunable');
    this.isColor = config.type.includes('color');
    this.brightMin = config.brightMin || 25;
    this.brightMax = config.brightMax || 255;
    this.brightDelta = this.brightMax - this.brightMin;
    this.tempMin = config.tempMin || 0;
    this.tempMax = config.tempMax || 255;
    this.tempDelta = this.tempMax - this.tempMin;
    this.dpsOnOff = 1;
    this.dpsMode = this.isColor ? 2 : null;
    // eslint-disable-next-line no-nested-ternary
    this.dpsBrightness = this.isDimmable ? (this.isColor ? 3 : 2) : null;
    // eslint-disable-next-line no-nested-ternary
    this.dpsWhiteTemp = this.isTunable ? (this.isColor ? 4 : 3) : null;
    this.dpsColor = this.isColor ? 5 : null;
    this.dpsScene = this.isColor ? 6 : null;
    this.dpsScene1 = this.isColor ? 7 : null;
    this.dpsScene2 = this.isColor ? 8 : null;
    this.dpsScene3 = this.isColor ? 9 : null;
    this.dpsScene4 = this.isColor ? 10 : null;
    this.hkBrightMin = 1;
    this.hkBrightMax = 100;
    this.hkBrightDelta = 100 - 1;
    this.hkWhiteTempMin = 140;
    this.hkWhiteTempMax = 500;
    this.hkWhiteTempDelta = 500 - 140;
    this.setPropertySubject = new Subject();
    this.setPropertySubject.pipe(
      debounceTime(this.tuyaDev.setPropertyDelay + 100),
    ).subscribe((task) => {
      debug('subscribe in setPropertySubject', task);
      task.task.call(this, ...task.args);
    });
    this.setPropertyCallbacks = [];
  }

  log(...args) {
    this.tuyaDev.log('[TLB]', ...args);
  }

  getOnOff(callback = () => {}) {
    this.tuya.getProperty(this.devId, this.dpsOnOff)
      .then((onOff) => {
        debug(this.name, 'is', onOff ? 'on' : 'off');
        callback(null, onOff);
      })
      .catch((error) => {
        debug(this.name, 'getting on/off error', error.message);
        callback(error);
      });
  }

  setOnOff(onOff, callback = () => {}) {
    this.tuya.setProperty(this.devId, this.dpsOnOff, onOff)
      .then((result) => {
        debug(this.name, 'set', onOff ? 'on' : 'off', result ? 'success' : 'fail');
        // set correct mode
        if (this.isColor) {
          this.getMode((error, mode) => {
            if (error) {
              callback(error);
            } else {
              this.setMode(mode, callback);
            }
          });
        } else {
          callback(null, result);
        }
      })
      .catch((error) => {
        debug(this.name, 'setting', onOff ? 'on' : 'off', 'error', error.message);
        callback(error);
      });
  }

  getBrightness(callback = () => {}) {
    if (this.isDimmable) {
      this.tuya.getProperty(this.devId, this.dpsBrightness)
        .then((bright) => {
          debug(this.name, 'brightness is', bright);
          callback(null, this.brightnessTuya2HomeKit(bright));
        })
        .catch((error) => {
          debug(this.name, 'getting brightness error', error.message);
          callback(error);
        });
    } else {
      callback(new Error('Bulb isn\'t capable to get brightness'));
    }
  }

  setBrightness(bright, callback = () => {}) {
    if (this.isDimmable) {
      this.tuya.setProperty(this.devId, this.dpsBrightness, this.brightnessHomeKit2Tuya(bright))
        .then((result) => {
          debug(this.name, 'set brightness', bright, result ? 'success' : 'fail');
          // If bulb is off, set it off
          this.getOnOff((error, onOff) => {
            if (error) {
              callback(error);
            } else {
              this.setOnOff(onOff, (err, res) => {
                if (err) {
                  callback(err);
                } else {
                  callback(null, res);
                }
              });
            }
          });
        })
        .catch((error) => {
          debug(this.name, 'setting brightness', bright, 'error', error.message);
          callback(error);
        });
    } else {
      callback(new Error('Bulb isn\'t capable to set brightness'));
    }
  }

  setBrightnessDebounce(bright, callback = () => {}) {
    if (this.isDimmable) {
      const nextCallback = (error, result) => {
        debug('setBrightnessDebounce nextCallback', this.setPropertyCallbacks);
        this.setPropertyCallbacks.forEach((cb) => {
          cb(error, result);
        });
        this.setPropertyCallbacks = [];
      };
      debug('setBrightnessDebounce', bright);
      this.setPropertyCallbacks.push(callback);
      this.setPropertySubject.next({ task: this.setBrightness, args: [bright, nextCallback] });
    } else {
      callback(new Error('Bulb isn\'t capable to set brightness'));
    }
  }

  getWhiteTemp(callback = () => {}) {
    if (this.isTunable) {
      this.tuya.getProperty(this.devId, this.dpsWhiteTemp)
        .then((whiteTemp) => {
          debug(this.name, 'white temperature is', whiteTemp);
          callback(null, this.whiteTempTuya2HomeKit(whiteTemp));
        })
        .catch((error) => {
          debug(this.name, 'getting white temperatur error', error.message);
          callback(error);
        });
    } else {
      callback(new Error('Bulb isn\'t capable to set white temperature'));
    }
  }

  setWhiteTemp(whiteTemp, callback = () => {}) {
    if (this.isTunable) {
      this.setModeWhite((modeError) => {
        if (modeError) {
          callback(modeError);
        } else {
          this.tuya.setProperty(this.devId, this.dpsWhiteTemp, this.whiteTempHomeKit2Tuya(whiteTemp))
            .then((result) => {
              debug(this.name, 'set white temperature', whiteTemp, result ? 'success' : 'fail');
              // If bulb is off, set it off
              this.getOnOff((error, onOff) => {
                if (error) {
                  callback(error);
                } else {
                  this.setOnOff(onOff, (err, res) => {
                    if (err) {
                      callback(err);
                    } else {
                      callback(null, res);
                    }
                  });
                }
              });
            })
            .catch((error) => {
              debug(this.name, 'setting white temperature', whiteTemp, 'error', error.message);
              callback(error);
            });
        }
      });
    } else {
      callback(new Error('Bulb isn\'t capable to set white temperature'));
    }
  }

  setWhiteTempDebounce(whiteTemp, callback = () => {}) {
    if (this.isTunable) {
      const nextCallback = (error, result) => {
        debug('setWhiteTempDebounce nextCallback', this.setPropertyCallbacks);
        this.setPropertyCallbacks.forEach((cb) => {
          cb(error, result);
        });
        this.setPropertyCallbacks = [];
      };
      debug('setWhiteTempDebounce', whiteTemp);
      this.setPropertyCallbacks.push(callback);
      this.setPropertySubject.next({ task: this.setWhiteTemp, args: [whiteTemp, nextCallback] });
    } else {
      callback(new Error('Bulb isn\'t capable to set white temperature'));
    }
  }

  getSceneOnOff(scene, callback = () => {}) {
    if (this.isColor) {
      if (scene < 0 || scene >= kModeScenes.length) {
        callback(new Error('Incorrect scene number'));
      } else {
        this.getOnOff((error, onOff) => {
          if (error) {
            callback(error);
          } else if (!onOff) {
            callback(null, onOff);
          } else {
            this.getMode((err, mode) => {
              if (err) {
                callback(err);
              } else {
                const sceneOnOff = mode === kModeScenes[scene];
                debug(this.name, kModeScenes[scene], 'is', sceneOnOff);
                callback(null, sceneOnOff);
              }
            });
          }
        });
      }
    } else {
      callback(new Error('Bulb isn\'t capable to get on/off status'));
    }
  }

  setSceneOnOff(onOff, scene, callback = () => {}) {
    if (this.isColor) {
      if (scene < 0 || scene >= kModeScenes.length) {
        callback(new Error('Incorrect scene number'));
      } else if (onOff) {
        this.setOnOff(onOff, (error) => {
          if (error) {
            callback(error);
          } else {
            this.setModeScene(scene, (err, res) => {
              if (err) {
                callback(err);
              } else {
                debug(this.name, 'set scene', scene, res ? 'success' : 'fail');
                callback(null, res);
              }
            });
          }
        });
      } else {
        this.getMode((error, mode) => {
          if (error) {
            callback(error);
          } else if (mode === kModeScenes[scene]) {
            this.setModeWhite(callback);
          } else {
            callback(new Error(`Scene ${scene} isn't on`));
          }
        });
      }
    }
  }

  getMode(callback = () => {}) {
    if (this.isColor) {
      this.tuya.getProperty(this.devId, this.dpsMode)
        .then((mode) => {
          debug(this.name, 'mode is', mode);
          callback(null, mode);
        })
        .catch((error) => {
          debug(this.name, 'getting mode error', error.message);
          callback(error);
        });
    } else {
      callback(null, kModeWhite);
    }
  }

  setMode(mode, callback = () => {}) {
    if (this.isColor) {
      this.tuya.setProperty(this.devId, this.dpsMode, mode)
        .then((result) => {
          debug(this.name, 'set mode', mode, result ? 'success' : 'fail');
          callback(null, result);
        })
        .catch((error) => {
          debug(this.name, 'setting mode', mode, 'error', error.message);
          callback(error);
        });
    } else {
      callback(new Error('Bulb isn\'t capable to set mode'));
    }
  }

  setModeWhite(callback = () => {}) {
    if (this.isColor) {
      this.setMode(kModeWhite, callback);
    } else {
      callback(new Error('Bulb isn\'t capable to set mode'));
    }
  }

  setModeColor(callback = () => {}) {
    if (this.isColor) {
      this.setMode(kModeColor, callback);
    } else {
      callback(new Error('Bulb isn\'t capable to set mode'));
    }
  }

  setModeScene(scene, callback = () => {}) {
    // debug('setModeScene', kModeScenes[scene], scene, kModeScenes);
    if (this.isColor) {
      if (scene < 0 || scene >= kModeScenes.length) {
        callback(new Error('Incorrect scene number'));
      } else {
        this.setMode(kModeScenes[scene], callback);
      }
    } else {
      callback(new Error('Bulb isn\'t capable to set mode'));
    }
  }

  brightnessTuya2HomeKit(bright) {
    const brightness = Math.round(((bright - this.brightMin) / this.brightDelta) * this.hkBrightDelta + this.hkBrightMin);
    debug('Convert brightness Tuya', bright, '=> HomeKit', brightness);
    return brightness;
  }

  brightnessHomeKit2Tuya(brightness) {
    const bright = Math.round(((brightness - this.hkBrightMin) / this.hkBrightDelta) * this.brightDelta + this.brightMin);
    debug('Convert brightness HomeKit', brightness, '=> Tuya', bright);
    return bright;
  }

  whiteTempTuya2HomeKit(whiteTemp) {
    const temperature = Math.round(this.hkWhiteTempMax - ((whiteTemp - this.tempMin) / this.tempDelta) * this.hkWhiteTempDelta);
    debug('Convert white temperature Tuya', whiteTemp, '=> HomeKit', temperature);
    return temperature;
  }

  whiteTempHomeKit2Tuya(whiteTemperature) {
    const temp = Math.round(this.tempMax - ((whiteTemperature - this.hkWhiteTempMin) / this.hkWhiteTempDelta) * this.tempDelta);
    debug('Convert white temperature HomeKit', whiteTemperature, ' => Tuya', temp);
    return temp;
  }
}

module.exports = TuyaLightBulb;
