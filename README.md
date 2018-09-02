
Homebridge plugin for Lohas/Tuya Led Smart Bulb and Teckin/Tuya Smart Socket
===================================

Example `config.json` for Tuya based LED Smart Lamp that support dimmable and changing of color temperature:

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
            "enableColor": true
        },
    ]
```

Example `config.json` for Tuya based Smart Socket with energy monitoring

```json
    "accessories": [
        {
            "accessory": "TuyaSmartDevice",
            "name": "Coffee Machine",
            "type": "outlet monitoring",
            "manufacturer": "Teckin",
            "model": "Smart Socket SP23",
            "devId": "XXXXXXXXXX",
            "localKey": "XXXXXXXXXXXXXX",
            "interval": 15
        }
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
| brightMin | minimum value which can be set as bulb's brightness, usualy it's 25 for RGB lamps and 11 for others |
| brightMax | maximum value which can be set as bulb's brightness, default is 255 |
| tempMin | minimum value which can be set as bulb's warm white light temperature, default is 0 |
| tempMax | maximum value which can be set as bulb's cool white light temperature, default is 255 |
| interval | interval in seconds for pooling energy parameters and saving in history for Eve App |
| enableColor | enable color controls for bulb |

Tested on the following Smart LED bulbs (Non affiliated links following) and Smart WiFi sockets:
* [LOHAS WiFi A65 B22 Smart Light Bulbs](https://www.amazon.co.uk/gp/product/B0796NLTFT)
* [LOHAS E14 WiFi LED Candle Bulbs](https://www.amazon.co.uk/gp/product/B0796NXVN8)
* [LOHAS Alexa Smart LED WiFi Bulb, R95 B22 Colour Changing Light Bulb](https://www.amazon.co.uk/gp/product/B076HPNHGK)
* [WiFi Smart Bulb B22 LED Dimmable 7W RGB Bulb](https://www.amazon.co.uk/gp/product/B078YRK1RG)
* [WiFi Smart Plug, TECKIN Mini Outlet Smart Socket](https://www.amazon.co.uk/gp/product/B07D7BH6N8)

This plugin should work with any Tuya based LED bulb that can be added to the Tuya or Smart Life apps, or even any Tuya based Samrt Switch (simply set type as an empty string).

LOHAS is a popular brand and theirs products can be found on [LOHAS Lights](http://www.lohas-led.com/) or on Amazon: [LOHAS Lights on Amazon](https://www.amazon.com/s?ie=UTF8&me=A2X4NE86JUW3T&page=1)

Work in progress...
