
const TuyaAccessory = require('../lib/TuyaAccessory');
const { Subject } = require('rxjs');
const { debounceTime } = require('rxjs/operators');
const convert = require('color-convert');
const debug = require('debug')('TuyaLightBulb');

const kModeWhite = 'white';
const kModeColor = 'colour'; // dps 5 - RRGGBB + '0000ffff'
const kModeScene = 'scene'; // Night, Reading, Party, Leisure, dps 6, stable color - RRGGBB + '0168ffff'
const kModeScene1 = 'scene_1'; // Soft, dps 7, colors 1, smooth color fading - 'ffff' + SS + '01' + RRGGBB
const kModeScene2 = 'scene_2'; // Rainbow, dps 8, colors 6, change of colors - 'ffff' + SS + CC + RRGGBB + ... + RRGGBB
const kModeScene3 = 'scene_3'; // Shine, dps 9, colors 1, flashing color - 'ffff' + SS + '01' + RRGGBB
const kModeScene4 = 'scene_4'; // Gorgeaous, dps 10, colors 6, smooth change of colors - 'ffff' + SS + CC + RRGGBB + ... + RRGGBB
const kModeScenes = [kModeScene, kModeScene1, kModeScene2, kModeScene3, kModeScene4];
const kScene1Colors = ['00ff00'];
const kScene2Colors = ['ff0000', '00ff00', '0000ff'];
const kScene3Colors = ['ffff00'];
const kScene4Colors = ['ffff00', '00ffff', 'ff00ff'];
const kScenesColors = [null, kScene1Colors, kScene2Colors, kScene3Colors, kScene4Colors];
const kSceneSpeedMin = 1;
const kScenesSpeedMin = [null, kSceneSpeedMin, kSceneSpeedMin, kSceneSpeedMin, kSceneSpeedMin];
const kScene1SpeedMax = 120;
const kScene2SpeedMax = 248;
const kScene3SpeedMax = 253;
const kScene4SpeedMax = 245;
const kScenesSpeedMax = [null, kScene1SpeedMax, kScene2SpeedMax, kScene3SpeedMax, kScene4SpeedMax];
const kCheckOffDebounceTime = 250;

class TuyaLightBulb extends TuyaAccessory {
    constructor(config, resolver, log, hb) {
        super(config, resolver, log, hb);
        this.isDimmable = config.type.includes('dimmable');
        this.isTunable = config.type.includes('tunable');
        this.isColor = config.type.includes('color');
        this.brightMin = config.brightMin || 25;
        this.brightMax = config.brightMax || 255;
        this.brightDelta = this.brightMax - this.brightMin;
        this.tempMin = config.tempMin || 0;
        this.tempMax = config.tempMax || 255;
        this.tempDelta = this.tempMax - this.tempMin;
        this.enableColor = config.enableColor || false;
        this.enableScene = config.enableScene || false;
        this.enableScene1 = config.enableScene1 || false;
        this.enableScene2 = config.enableScene2 || false;
        this.enableScene3 = config.enableScene3 || false;
        this.enableScene4 = config.enableScene4 || false;
        this.dpsOnOff = 1;
        this.dpsMode = this.isColor ? 2 : null;
        // eslint-disable-next-line no-nested-ternary
        this.dpsBrightness = this.isDimmable ? (config.dpsBrightness ? config.dpsBrightness : (this.isColor ? 3 : 2)) : null;
        // eslint-disable-next-line no-nested-ternary
        this.dpsWhiteTemp = this.isTunable ? (config.dpsWhiteTemp ? config.dpsWhiteTemp : (this.isColor ? 4 : 3)) : null;
        this.dpsColor = this.isColor ? 5 : null;
        this.dpsScene = this.isColor ? 6 : null;
        this.dpsScene1 = this.isColor ? 7 : null;
        this.dpsScene2 = this.isColor ? 8 : null;
        this.dpsScene3 = this.isColor ? 9 : null;
        this.dpsScene4 = this.isColor ? 10 : null;
        this.dpsScenes = [this.dpsScene, this.dpsScene1, this.dpsScene2, this.dpsScene3, this.dpsScene4];
        this.hkBrightMin = 1;
        this.hkBrightMax = 100;
        this.hkBrightDelta = 100 - 1;
        this.hkWhiteTempMin = 140;
        this.hkWhiteTempMax = 500;
        this.hkWhiteTempDelta = 500 - 140;
        this.onOff = null;
        this.brightness = null;
        this.whiteTemperature = null;
        this.hue = 1;
        this.sat = 100;
        this.val = 75;
        this.scenesColors = kScenesColors;
        this.scenesSpeedMin = kScenesSpeedMin;
        this.scenesSpeedMax = kScenesSpeedMax;
        this.checkOffQueue = new Subject();
        this.checkOffQueue.pipe(
            debounceTime(kCheckOffDebounceTime)
        ).subscribe(() => {
            // If bulb is off, set it off
            this.getOnOff()
                .then((onOff) => {
                    if (!onOff) {
                        this.setOnOff(onOff)
                            .then(res => this.debug('Turn off when bulb is off', res))
                            .catch(error => this.error('Turn off when bulb is off', error));
                    }
                })
                .catch(error => this.error('getOnOff status', error));
        });
        this.onCharacteristics = [];
    }
    log(...args) {
        this.hblog('[TLB]', ...args);
    }
    error(...args) {
        if (this.config.logErrors) {
            this.hblog.error('[TLB] Error:', ...args);
        } else {
            this.debug('ERROR:', ...args);
        }
    }

    getDeviceService() {
        this.debug('call getDeviceService');
        if (this.deviceServices != null) {
            return this.deviceServices;
        }
    
        this.deviceServices = [];

        const lightbulbService = new this.Service.Lightbulb(this.config.name, 'white');
        this.deviceServices.push(lightbulbService);

        const whiteOnOff = lightbulbService.getCharacteristic(this.Characteristic.On)
            .on('get', this.getWhiteOnOff.bind(this))
            .on('set', (onOff, callback) => {
                this.updateOnCharacteristics(onOff, whiteOnOff);
                this.setWhiteOnOff(onOff, callback);
            });
        this.onCharacteristics.push(whiteOnOff);

        if (this.isDimmable) {
            const brightness = lightbulbService.getCharacteristic(this.Characteristic.Brightness)
                .on('get', this.getBrightness.bind(this))
                .on('set', this.setBrightness.bind(this));
            this.hkBrightMin = brightness.props.minValue + brightness.props.minStep;
            this.hkBrightMax = brightness.props.maxValue;
            this.hkBrightDelta = this.hkBrightMax - this.hkBrightMin;
        }

        if (this.isTunable) {
            const whiteColor = lightbulbService.getCharacteristic(this.Characteristic.ColorTemperature)
                .on('get', this.getWhiteTemp.bind(this))
                .on('set', this.setWhiteTemp.bind(this));
            this.hkWhiteTempMin = whiteColor.props.minValue;
            this.hkWhiteTempMax = whiteColor.props.maxValue;
            this.hkWhiteTempDelta = this.hkWhiteTempMax - this.hkWhiteTempMin;
        }

        if (this.isColor) {
            if (this.enableColor) {
                const colorService = new this.Service.Lightbulb(`Color ${this.config.name}`, 'color');
                this.deviceServices.push(colorService);

                const colorOnOff = colorService.getCharacteristic(this.Characteristic.On)
                    .on('get', this.getColorOnOff.bind(this))
                    .on('set', (onOff, callback) => {
                        this.updateOnCharacteristics(onOff, colorOnOff);
                        this.setColorOnOff(onOff, callback);
                    });
                this.onCharacteristics.push(colorOnOff);

                const hueCharacteristic = colorService.getCharacteristic(this.Characteristic.Hue)
                    .on('get', this.getColorHue.bind(this))
                    .on('set', this.setColorHue.bind(this));
                this.debug('Hue props', hueCharacteristic.props);

                const satCharacteristic = colorService.getCharacteristic(this.Characteristic.Saturation)
                    .on('get', this.getColorSaturation.bind(this))
                    .on('set', this.setColorSaturation.bind(this));
                this.debug('Saturation props', satCharacteristic.props);

                const valCharacteristic = colorService.getCharacteristic(this.Characteristic.Brightness)
                    .on('get', this.getColorValue.bind(this))
                    .on('set', this.setColorValue.bind(this));
                this.debug('Value/Bright props', valCharacteristic.props);
            }

            // Scene services
            const addSceneService = (scene, name) => {
                const sceneService = new this.Service.Lightbulb(`${name} ${this.config.name}`, `scene_${scene}`);
                this.deviceServices.push(sceneService);

                const sceneOnOff = sceneService.getCharacteristic(this.Characteristic.On)
                    .on('get', callback => this.getSceneOnOff(scene, callback))
                    .on('set', (onOff, callback) => {
                        this.updateOnCharacteristics(onOff, sceneService);
                        this.setSceneOnOff(onOff, scene, callback);
                    });
                this.onCharacteristics.push(sceneOnOff);

                sceneService.getCharacteristic(this.Characteristic.RotationSpeed)
                    .on('get', callback => this.getSceneSpeed(scene, callback))
                    .on('set', (speed, callback) => this.setSceneSpeed(speed, scene, callback))
                    .setProps({ minValue: 1 });
            };

            if (this.enableScene1) {
                addSceneService(1, 'Soft');
            }

            if (this.enableScene2) {
                addSceneService(2, 'Rainbow');
            }

            if (this.enableScene3) {
                addSceneService(3, 'Shine');
            }

            if (this.enableScene4) {
                addSceneService(4, 'Gorgeaous');
            }

            if (this.enableScene) {
                const scene = 0;
                const name = 'Random';
                let timeoutNumber;
                let speed = 30;
                let brightness = 70;
                let run = false;

                const setRandomSceneTimeout = () => {
                    timeoutNumber = setTimeout(() => {
                        const hue = Math.round(Math.random() * 360);
                        const saturation = 60 + Math.round(Math.random() * 40);
                        const color = this.hsv2rgb(hue, saturation, brightness);
                        this.setProperty(this.dpsScene, color)
                            .then(result => this.debug('setRandomScene color hue', hue, 'saturation', saturation, color, result ? 'success' : 'fail'))
                            .catch(error => this.error('setRandomScene color hue', hue, 'saturation', saturation, color, 'error', error));
                        if (run) {
                            setRandomSceneTimeout();
                        }
                    }, speed * 100);
                };

                const sceneService = new this.Service.Lightbulb(`${name} ${this.config.name}`, `scene_${scene}`);
                this.deviceServices.push(sceneService);

                const sceneOnOff = sceneService.getCharacteristic(this.Characteristic.On)
                    .on('get', callback => this.getSceneOnOff(scene, (error, onOff) => {
                        if (!error && onOff && !run) {
                            run = true;
                            setRandomSceneTimeout();
                        }
                        callback(error, onOff);
                    }))
                    .on('set', (onOff, callback) => {
                        this.updateOnCharacteristics(onOff, sceneService);
                        this.setSceneOnOff(onOff, scene, callback);
                        if (onOff) {
                            run = true;
                            setRandomSceneTimeout();
                        } else {
                            run = false;
                            if (timeoutNumber) {
                                clearTimeout(timeoutNumber);
                            }
                            timeoutNumber = null;
                        }
                    });
                this.onCharacteristics.push(sceneOnOff);

                sceneService.getCharacteristic(this.Characteristic.Brightness)
                    .on('get', callback => callback(null, brightness))
                    .on('set', (value, callback) => { brightness = value; callback(null, true); });

                sceneService.addCharacteristic(this.Characteristic.RotationSpeed)
                    .on('get', callback => callback(null, speed))
                    .on('set', (value, callback) => { speed = value; callback(null, true); })
                    .setProps({ minValue: 1 });

                // const speedCharacteristic = new this.Characteristic('Change speed', this.Characteristic.RotationSpeed.UUID, this.Characteristic.RotationSpeed.props);
                // sceneService.addCharacteristic(speedCharacteristic)
                //   .on('get', callback => callback(null, speed))
                //   .on('set', (value, callback) => { speed = value; callback(null, true); })
                //   .setProps({ minValue: 1 });

                sceneOnOff.getValue(() => {});
            }
        }
    
        return this.deviceServices;
    }


    //
    // On/Off methods
    //
    getWhiteOnOff(callback = () => {}) {
        this.debug('call getWhiteOnOff');
        this.getModeOnOff(kModeWhite)
            .then(onOff => callback(null, onOff))
            .catch(error => callback(error));
    }

    setWhiteOnOff(onOff, callback = () => {}) {
        this.debug('call setWhiteOnOff to turn', onOff ? 'on' : 'off');
        this.setModeOnOff(kModeWhite, onOff)
            .then(result => callback(null, result))
            .catch(error => callback(error));
    }

    getColorOnOff(callback = () => {}) {
        this.debug('call getColorOnOff');
        this.getModeOnOff(kModeColor)
            .then(onOff => callback(null, onOff))
            .catch(error => callback(error));
    }

    setColorOnOff(onOff, callback = () => {}) {
        this.debug('call setColorOnOff to turn', onOff ? 'on' : 'off');
        this.setModeOnOff(kModeColor, onOff)
            .then(result => callback(null, result))
            .catch(error => callback(error));
    }

    getSceneOnOff(scene, callback = () => {}) {
        this.debug('call getSceneOnOff for scene id', scene);
        if (scene < 0 || scene >= kModeScenes.length) {
            callback(new Error('getSceneOnOff incorrect scene number'));
        } else {
            this.getModeOnOff(kModeScenes[scene])
                .then(onOff => callback(null, onOff))
                .catch(error => callback(error));
        }
    }

    setSceneOnOff(onOff, scene, callback = () => {}) {
        this.debug('call setSceneOnOff for scene id', scene);
        if (scene < 0 || scene >= kModeScenes.length) {
            callback(new Error('Incorrect scene number'));
        } else {
            this.setModeOnOff(kModeScenes[scene], onOff)
                .then(result => callback(null, result))
                .catch(error => callback(error));
        }
    }

    updateOnCharacteristics(onOff, onCharacteristic) {
        if (onOff) {
            this.onCharacteristics.forEach((characteristic) => {
                if (characteristic !== onCharacteristic) {
                    characteristic.updateValue(false);
                }
            });
        }
    }

    //
    //  Brightness methods
    //
    getBrightness(callback = () => {}) {
        this.debug('call getBrightnes');
        if (this.isDimmable) {
            this.getProperty(this.dpsBrightness)
                .then((bright) => {
                    this.debug('brightness is', bright);
                    callback(null, this.brightnessTuya2HomeKit(bright));
                })
                .catch((error) => {
                    this.error('getting brightness error', error);
                    callback(error);
                    // this.setBrightness(75, (err) => {
                    //   if (err) {
                    //     callback(err);
                    //   } else {
                    //     callback(null, 75);
                    //   }
                    // });
                });
        } else {
            callback(new Error('Bulb isn\'t capable to get brightness'));
        }
    }

    setBrightness(bright, callback = () => {}) {
        this.debug('call setBrightness', bright);
        if (this.isDimmable) {
            this.setProperty(this.dpsBrightness, this.brightnessHomeKit2Tuya(bright))
                .then((result) => {
                    this.debug('set brightness', bright, result ? 'success' : 'fail');
                    // If bulb is off, set it off
                    this.checkOffQueue.next(true);
                    callback(null, result);
                })
                .catch((error) => {
                    this.error('setting brightness', bright, 'error', error);
                    callback(error);
                });
        } else {
            callback(new Error('Bulb isn\'t capable to set brightness'));
        }
    }

    //
    // White Temperature methods
    //
    getWhiteTemp(callback = () => {}) {
        this.debug('call getWhiteTemp');
        if (this.isTunable) {
            this.getProperty(this.dpsWhiteTemp)
                .then((whiteTemp) => {
                    this.debug('white temperature is', whiteTemp);
                    callback(null, this.whiteTempTuya2HomeKit(whiteTemp));
                })
                .catch((error) => {
                    this.error('getting white temperatur error', error);
                    callback(error);
                });
        } else {
            callback(new Error('Bulb isn\'t capable to get white temperature'));
        }
    }

    setWhiteTemp(whiteTemp, callback = () => {}) {
        this.debug('call setWhiteTemp', whiteTemp);
        if (this.isTunable) {
            this.setProperty(this.dpsWhiteTemp, this.whiteTempHomeKit2Tuya(whiteTemp))
                .then((result) => {
                    this.debug('set white temperature', whiteTemp, result ? 'success' : 'fail');
                    // If bulb is off, set it off
                    this.checkOffQueue.next(true);
                    callback(null, result);
                })
                .catch((error) => {
                    this.error('setting white temperature', whiteTemp, 'error', error);
                    callback(error);
                });
        } else {
            callback(new Error('Bulb isn\'t capable to set white temperature'));
        }
    }

    //
    // Color components methods
    //
    getColorHue(callback = () => {}) {
        this.debug('call getColorHue');
        if (this.isColor) {
            this.getColor()
                .then((hsv) => {
                    this.debug('color hue', hsv[0] || hsv[3]);
                    callback(null, hsv[0] || hsv[3]);
                })
                .catch(error => callback(error));
        } else {
            callback(new Error('Bulb isn\'t capable to get color hue'));
        }
    }

    getColorSaturation(callback = () => {}) {
        this.debug('call getColorSaturation');
        if (this.isColor) {
            this.getColor()
                .then((hsv) => {
                    this.debug('color saturation', hsv[1] || hsv[4]);
                    callback(null, hsv[1] || hsv[4]);
                })
                .catch(error => callback(error));
        } else {
            callback(new Error('Bulb isn\'t capable to get color saturation'));
        }
    }

    getColorValue(callback = () => {}) {
        this.debug('call getColorValue');
        if (this.isColor) {
            this.getColor()
                .then((hsv) => {
                    this.debug('color value/light', hsv[2] || hsv[5]);
                    callback(null, hsv[2] || hsv[5]);
                })
                .catch(error => callback(error));
        } else {
            callback(new Error('Bulb isn\'t capable to get color value/light'));
        }
    }

    setColorNow(callback) {
        this.setColor(this.hue, this.sat, this.val)
            .then(result => callback(null, result))
            .catch(error => callback(error));
    }

    setColorHue(hue, callback = () => {}) {
        this.debug('call setHue', hue);
        if (this.isColor) {
            this.hue = hue;
            this.setColorNow(callback);
        } else {
            callback(new Error('Bulb isn\'t capable to set hue'));
        }
    }

    setColorSaturation(sat, callback = () => {}) {
        this.debug('call setSaturation', sat);
        if (this.isColor) {
            this.sat = sat;
            this.setColorNow(callback);
        } else {
            callback(new Error('Bulb isn\'t capable to set saturation'));
        }
    }

    setColorValue(val, callback = () => {}) {
        this.debug('call setValue', val);
        if (this.isColor) {
            this.val = val;
            this.setColorNow(callback);
        } else {
            callback(new Error('Bulb isn\'t capable to set saturation'));
        }
    }

    //
    // Scene parameters methods
    //
    getSceneSpeed(scene, callback) {
        this.debug('call getSceneSpeed', kModeScenes[scene]);
        if (this.isColor) {
            this.getSceneColors(scene)
                .then(((colors) => {
                    const speed = this.getSpeedFromSceneColors(scene, colors);
                    callback(null, speed);
                }))
                .catch((error) => {
                    const defaultSpeed = 10;
                    this.debug('getting scene', kModeScenes[scene], 'speed error', error);
                    this.setSceneColors(scene, this.makeSceneColors(scene, defaultSpeed, this.scenesColors[scene]))
                        .then(result => (result ? callback(null, defaultSpeed) : callback(error)))
                        .catch(err => callback(err));
                });
        } else {
            callback(new Error('Bulb isn\'t capable to set scene parameters'));
        }
    }

    setSceneSpeed(speed, scene, callback) {
        this.debug('call setSceneSpeed', kModeScenes[scene], speed, this.scenesColors[scene]);
        if (this.isColor) {
            this.setSceneColors(scene, this.makeSceneColors(scene, speed, this.scenesColors[scene]))
                .then(result => callback(null, result))
                .catch(error => callback(error));
        } else {
            callback(new Error('Bulb isn\'t capable to set scene parameters'));
        }
    }

    // setSceneSpeedDebounce(speed, scene, callback) {
    //     this.debug('call setSceneSpeedDebounce', kModeScenes[scene], speed, this.scenesColors[scene]);
    //     if (this.isColor) {
    //         const nextCallback = (error, result) => {
    //             this.debug('call setSceneSpeedDebounce nextCallback', this.setPropertyCallbacks);
    //             this.setPropertyCallbacks.forEach((cb) => {
    //                 cb(error, result);
    //             });
    //             this.setPropertyCallbacks = [];
    //         };
    //         this.setPropertyCallbacks.push(callback);
    //         this.setPropertySubject.next({ task: this.setSceneSpeed, args: [speed, scene, nextCallback] });
    //     } else {
    //         callback(new Error('Bulb isn\'t capable to set color'));
    //     }
    // }

    //
    // async methods
    //
    async getOnOff() {
        return new Promise((resolve, reject) => {
            this.debug('call getOnOff');
            this.getProperty(this.dpsOnOff)
                .then((onOff) => {
                    this.debug('is', onOff ? 'on' : 'off');
                    resolve(onOff);
                })
                .catch((error) => {
                    this.error('getting on/off status error', error);
                    this.setOnOff(false)
                        .then(() => resolve(false))
                        .catch(err => reject(err));
                });
        });
    }

    async setOnOff(onOff) {
        return new Promise((resolve, reject) => {
            this.debug('call setOnOff to turn', onOff ? 'on' : 'off');
            this.setProperty(this.dpsOnOff, onOff)
                .then((result) => {
                    this.debug('set', onOff ? 'on' : 'off', result ? 'success' : 'fail');
                    // set correct mode when turn on and bulb is color
                    if (onOff && result && this.isColor) {
                        this.debug('set correct mode');
                        this.getMode()
                            .then((mode) => {
                                if (mode) {
                                    this.setMode(mode)
                                        .then(res => resolve(res))
                                        .catch(error => reject(error));
                                } else {
                                    // if mode is undefined just resolve
                                    resolve(result);
                                }
                            })
                            .catch((error) => {
                                // if error when getting previous mode just resolve
                                this.debug('Getting previous mode error', error);
                                resolve(result);
                            });
                    } else {
                        resolve(result);
                    }
                })
                .catch((error) => {
                    this.error('turning', onOff ? 'on' : 'off', 'error', error);
                    reject(error);
                });
        });
    }

    async getModeOnOff(checkMode) {
        return new Promise((resolve, reject) => {
            this.debug('call getModeOnOff with mode', checkMode);
            if (checkMode === kModeWhite || this.isColor) {
                this.getOnOff()
                    .then((onOff) => {
                        if (onOff && this.isColor) {
                            this.getMode()
                                .then((mode) => {
                                    this.debug('mode', checkMode, 'is', mode === checkMode ? 'on' : 'off');
                                    resolve(mode === checkMode);
                                })
                                .catch(error => reject(error));
                        } else {
                            resolve(onOff);
                        }
                    })
                    .catch((error) => {
                        reject(error);
                    });
            } else {
                reject(new Error('Bulb isn\'t capable to work in mode other than white'));
            }
        });
    }

    async setModeOnOff(destMode, onOff) {
        return new Promise((resolve, reject) => {
            this.debug('call setModeOnOff with mode', destMode, 'to turn', onOff ? 'on' : 'off');
            if (destMode === kModeWhite || this.isColor) {
                this.setOnOff(onOff)
                    .then((result) => {
                        if (onOff && this.isColor) {
                            this.setMode(destMode)
                                .then(res => resolve(res))
                                .catch(err => reject(err));
                        } else {
                            resolve(result);
                        }
                    })
                    .catch(error => reject(error));
            } else {
                reject(new Error('Bulb isn\'t capable to work in mode other than white'));
            }
        });
    }

    async getColor() {
        return new Promise((resolve, reject) => {
            this.debug('call getColor');
            if (this.isColor) {
                this.getProperty(this.dpsColor)
                    .then((color) => {
                        this.debug('color is', color);
                        resolve(this.rgb2hsv(color));
                    })
                    .catch((error) => {
                        this.error('getting color error', error);
                        this.setColor(this.hue, this.sat, this.val)
                            .then(() => resolve([this.hue, this.sat, this.val]))
                            .catch(err => reject(err));
                    });
            } else {
                reject(new Error('Bulb isn\'t capable to get color'));
            }
        });
    }

    async setColor(hue, sat, val) {
        return new Promise((resolve, reject) => {
            this.debug('call setColor', hue, sat, val);
            if (this.isColor) {
                this.setProperty(this.dpsColor, this.hsv2rgb(hue, sat, val))
                    .then((result) => {
                        this.debug('set color', [hue, sat, val], result ? 'success' : 'fail');
                        // If bulb is off, set it off
                        this.getOnOff()
                            .then((onOff) => {
                                if (!onOff) {
                                    this.setOnOff(onOff)
                                        .then(res => resolve(res))
                                        .catch(error => reject(error));
                                } else {
                                    resolve(result);
                                }
                            })
                            .catch(error => reject(error));
                    })
                    .catch((error) => {
                        this.error('setting color', [hue, sat, val], 'error', error);
                        reject(error);
                    });
            } else {
                reject(new Error('Bulb isn\'t capable to set color'));
            }
        });
    }

    async getSceneColors(scene) {
        return new Promise((resolve, reject) => {
            this.debug('call setSceneColors', kModeScenes[scene]);
            if (this.isColor) {
                this.getProperty(this.dpsScenes[scene])
                    .then(result => resolve(result))
                    .catch(error => reject(error));
            }
        });
    }

    async setSceneColors(scene, colors) {
        return new Promise((resolve, reject) => {
            this.debug('call setSceneColors', kModeScenes[scene], colors);
            if (this.isColor) {
                this.setProperty(this.dpsScenes[scene], colors)
                    .then(result => resolve(result))
                    .catch(error => reject(error));
            }
        });
    }

    async getMode() {
        return new Promise((resolve, reject) => {
            this.debug('call getMode');
            if (this.isColor) {
                this.getProperty(this.dpsMode)
                    .then((mode) => {
                        this.debug('mode is', mode);
                        resolve(mode);
                    })
                    .catch((error) => {
                        this.error('getting mode error', error);
                        this.setMode(kModeWhite)
                            .then(() => resolve(kModeWhite))
                            .catch(err => reject(err));
                    });
            } else {
                resolve(kModeWhite);
            }
        });
    }

    async setMode(mode) {
        return new Promise((resolve, reject) => {
            this.debug('call setMode', mode);
            if (this.isColor) {
                this.setProperty(this.dpsMode, mode)
                    .then((result) => {
                        this.debug('set mode', mode, result ? 'success' : 'fail');
                        resolve(result);
                    })
                    .catch((error) => {
                        this.error('setting mode', mode, 'error', error);
                        reject(error);
                    });
            } else {
                reject(new Error('Bulb isn\'t capable to set mode'));
            }
        });
    }

    async setModeWhite() {
        return new Promise((resolve, reject) => {
            this.debug('call setModeWhite');
            if (this.isColor) {
                this.setMode(kModeWhite)
                    .then(result => resolve(result))
                    .catch(error => reject(error));
            } else {
                // resolve(true);
                reject(new Error('Bulb isn\'t capable to set mode'));
            }
        });
    }

    async setModeColor() {
        return new Promise((resolve, reject) => {
            this.debug('call setModeColor');
            if (this.isColor) {
                this.setMode(kModeColor)
                    .then(result => resolve(result))
                    .catch(error => reject(error));
            } else {
                reject(new Error('Bulb isn\'t capable to set mode'));
            }
        });
    }

    async setModeScene(scene) {
        return new Promise((resolve, reject) => {
            this.debug('call setModeScene', kModeScenes[scene], scene);
            if (this.isColor) {
                if (scene < 0 || scene >= kModeScenes.length) {
                    reject(new Error('Incorrect scene number'));
                } else {
                    this.setMode(kModeScenes[scene])
                        .then(result => resolve(result))
                        .catch(error => reject(error));
                }
            } else {
                reject(new Error('Bulb isn\'t capable to set mode'));
            }
        });
    }


    //
    // Conversion methods
    //
    brightnessTuya2HomeKit(bright) {
        const brightness = Math.round(((bright - this.brightMin) / this.brightDelta) * this.hkBrightDelta + this.hkBrightMin);
        this.debug('Convert brightness Tuya', bright, '=> HomeKit', brightness);
        return brightness;
    }

    brightnessHomeKit2Tuya(brightness) {
        const bright = Math.round(((brightness - this.hkBrightMin) / this.hkBrightDelta) * this.brightDelta + this.brightMin);
        this.debug('Convert brightness HomeKit', brightness, '=> Tuya', bright);
        return bright;
    }

    whiteTempTuya2HomeKit(whiteTemp) {
        const temperature = Math.round(this.hkWhiteTempMax - ((whiteTemp - this.tempMin) / this.tempDelta) * this.hkWhiteTempDelta);
        this.debug('Convert white temperature Tuya', whiteTemp, '=> HomeKit', temperature);
        return temperature;
    }

    whiteTempHomeKit2Tuya(whiteTemperature) {
        const temp = Math.round(this.tempMax - ((whiteTemperature - this.hkWhiteTempMin) / this.hkWhiteTempDelta) * this.tempDelta);
        this.debug('Convert white temperature HomeKit', whiteTemperature, ' => Tuya', temp);
        return temp;
    }

    // eslint-disable-next-line
    hsv2rgb(hue, sat, val) {
        const rgbhex = convert.rgb.hex(convert.hsv.rgb(hue, sat, val));
        const huehex = `000${hue.toString(16)}`.slice(-4);
        const sathex = `0${sat.toString(16)}`.slice(-2);
        const valhex = `0${val.toString(16)}`.slice(-2);
        const hex = `${rgbhex}${huehex}${sathex}${valhex}`;
        this.debug('Convert color HSV', [hue, sat, val], ' => RGB', hex);
        return hex;
    }

    // eslint-disable-next-line
    rgb2hsv(hex) {
        const rgbhex = hex.slice(0, 6);
        const huehex = hex.slice(6, 10);
        const sathex = hex.slice(10, 12);
        const valhex = hex.slice(12);
        const hue = parseInt(huehex, 16);
        const sat = parseInt(sathex, 16);
        const val = parseInt(valhex, 16);
        const hsvc = convert.rgb.hsv(convert.hex.rgb(rgbhex));
        const hsv = [hue, sat, val, ...hsvc];
        this.debug('Convert color RGB', hex, [rgbhex, huehex, sathex, valhex], ' => HSV', hsv);
        return hsv;
    }

    // eslint-disable-next-line
    makeSceneColors(scene, hkSpeed, colors) {
        const speed = this.speedHomeKit2Tuya(scene, hkSpeed);
        const speedhex = `0${speed.toString(16)}`.slice(-2);
        const colnohex = `0${colors.length.toString(16)}`.slice(-2);
        let result = `ffff${speedhex}${colnohex}`;
        colors.forEach((color) => { result += color; });
        this.debug('make scene colors', speed, colors, '=>', result);
        return result;
    }

    // eslint-disable-next-line
    getSpeedFromSceneColors(scene, colors) {
        const speedhex = colors.slice(4, 6);
        const speed = parseInt(speedhex, 16);
        const hkSpeed = this.speedTuya2HomeKit(scene, speed);
        this.debug('get speed from scene colors', colors, '=>', hkSpeed);
        return hkSpeed;
    }

    speedTuya2HomeKit(scene, speed) {
        const min = this.scenesSpeedMin[scene];
        const max = this.scenesSpeedMax[scene];
        const delta = max - min;
        const hkMin = 1;
        const hkMax = 100;
        const hkDelta = hkMax - hkMin;
        const hkSpeed = Math.round(((speed - min) / delta) * hkDelta + hkMin);
        this.debug('Convert speed Tuya', speed, '=> HomeKit', hkSpeed);
        return hkSpeed;
    }

    speedHomeKit2Tuya(scene, hkSpeed) {
        const min = this.scenesSpeedMin[scene];
        const max = this.scenesSpeedMax[scene];
        const delta = max - min;
        const hkMin = 1;
        const hkMax = 100;
        const hkDelta = hkMax - hkMin;
        const speed = Math.round(((hkSpeed - hkMin) / hkDelta) * delta + min);
        this.debug('Convert speed HomeKit', hkSpeed, '=> Tuya', speed);
        return speed;
    }
}

module.exports = TuyaLightBulb;
