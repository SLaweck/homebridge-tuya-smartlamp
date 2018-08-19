
Homebridge plugin for Tuya/Lohas Led Smart Lamp
===================================

Example `config.json` for Tuya based LED Smart Lamp that support dimmable and changing of color temperature:

```json
    "accessories": [
    	{
            "accessory": "TuyaSmartDevice",
            "name": "Kitchen Light",
            "type": "lightbulb dimmable tunable",
            "manufacturer": "LOHAS",
            "model": "Smart Lamp Multicolor",
            "devId": "XXXXXXXXXX",
            "localKey": "XXXXXXXXXXXXXX",
            "productKey":"XXXXXXXXXXX",
            "brightMin": 11,
            "brightMax": 255
        }
    ]
```

Example `config.json` for Tuya based multiple LED Smart Lamp, the second one is Multicolor LED RGB Lamp:

```json
    "accessories": [
    	{
            "accessory": "TuyaSmartDevice",
            "name": "Kitchen Light",
            "type": "lightbulb dimmable tunable",
            "manufacturer": "LOHAS",
            "model": "Smart Lamp",
            "devId": "XXXXXXXXXX",
            "localKey": "XXXXXXXXXXXXXX",
            "productKey":"XXXXXXXXXXX",
            "brightMin": 11
        },
    	{
            "accessory": "TuyaSmartDevice",
            "name": "Bedroom Light",
            "type": "lightbulb dimmable tunable color",
            "manufacturer": "LOHAS",
            "model": "Smart Lamp Multicolor",
            "devId": "XXXXXXXXXX",
            "localKey": "XXXXXXXXXXXXXX",
            "productKey":"XXXXXXXXXXX",
            "brightMin": 25
        },
    ]
```

To obtain the devId (hint: it has the MAC address in it), the localKey and the productKey, carefully read and review these procedures: [Linking a Tuya Device](https://github.com/codetheweb/tuyapi/blob/master/docs/SETUP.md)

Description of config structure:
| Key | Purpose |
|-----|---------|
| accessory | obligatory set to "TuyaSmartDevice" |
| name | device name passed to HomeKit |
| type | characteristic of device - tunable means posibility of changing white light temperature |
| manufacturer | simply passed to HomeKit, can be found in device details |
| model | simply passed to HomeKit, can be found in device details |
| devId | must be obtained from device [Linking a Tuya Device](https://github.com/codetheweb/tuyapi/blob/master/docs/SETUP.md) |
| localKey | must be obtained from device [Linking a Tuya Device](https://github.com/codetheweb/tuyapi/blob/master/docs/SETUP.md) |
| productKey | must be obtained from device [Linking a Tuya Device](https://github.com/codetheweb/tuyapi/blob/master/docs/SETUP.md) |
| brightMin | minimum value which can be set as bulb's brightness, usualy it's 25 for RGB lamps and 11 for others |
| brightMax | maximum value which can be set as bulb's brightness, default is 255 |
| tempMin | minimum value which can be set as bulb's warm white light temperature, default is 0 |
| tempMax | maximum value which can be set as bulb's cool white light temperature, default is 255 |

Currently there isn't support for setting colors of Multicolor RGB Lamps. It will be added in the future versions.

Tested on the following LED lights (Non affiliated links following):
* [LOHAS WiFi A65 B22 Smart Light Bulbs](https://www.amazon.co.uk/gp/product/B0796NLTFT)
* [LOHAS E14 WiFi LED Candle Bulbs](https://www.amazon.co.uk/gp/product/B0796NXVN8)
* [LOHAS Alexa Smart LED WiFi Bulb, R95 B22 Colour Changing Light Bulb](https://www.amazon.co.uk/gp/product/B076HPNHGK)

This plugin should work with any TUYA based LED bulb that can be added to the Tuya, or Smart Life apps or even any Tuya based Samrt Switch (simply set type as an empty string). 
LOHAS is a popular brand and theirs products can you found on [LOHAS Lights](http://www.lohas-led.com/) or on Amazon: [LOHAS Lights on Amazon](https://www.amazon.com/s?ie=UTF8&me=A2X4NE86JUW3T&page=1)

Work in progress...
