import * as huejay from 'huejay';
import * as fs from 'fs';
import * as moment from 'moment';

interface Config {
    username?: string;
    bridgeIp?: string;
    lightThres: number;
}

async function loop(client: any, config: Config) {
    // let's find some sensors
    let lightLevel: number = 0;
    let presence: boolean | null = null;
    let temp: number | null = null;

    const sensors = await client.sensors.getAll();
    for (const sensor of sensors) {
        if (sensor.type === "ZLLLightLevel") {
            lightLevel = sensor.state.attributes.attributes.lightlevel;
        } else if (sensor.type === "ZLLPresence") {
            presence = sensor.state.attributes.attributes.presence;
        } else if (sensor.type === "ZLLTemperature") {
            temp = sensor.state.attributes.attributes.temperature;
        }
    }

    console.log("LightLevel: " + lightLevel + ", Presence: " + presence + ", Temp: " + temp);

    const now = moment();
    const hour = now.hours();
    console.log("Current hour is: " + hour);

    // let's find the lights
    const lights = await client.lights.getAll();
    for (const light of lights) {
        console.log(`Light ${light.id} ${light.name}. State: ${light.on} [${light.type}]`);
        if (light.on && !presence && lightLevel > config.lightThres) {
            console.log("Turning it off, no presence and enough light ("
                + lightLevel + " > " + config.lightThres + ")");
            light.on = false;
            await client.lights.save(light);
        } else if (!light.on && presence && lightLevel < config.lightThres) {
            console.log("Would turn it on, presence and not enough light ("
                + lightLevel + " < " + config.lightThres + ")");

            if (hour >= 22 || hour < 9) {
                console.log("But not doing it, as it's past 22 and before 9!");
            } else if (hour >= 9 && hour <= 11) {
                console.log("Turning it on, in moring mode!");
                light.on = true;
                light.brightness = 100;

                if (light.type === "Color light" || light.type === "Extended color light") {
                    light.hue = 6000; // orange
                    light.saturation = 254;
                }
            } else if (hour > 11 && hour < 18) {
                console.log("Turning it on, in day mode");
                light.on = true;
                light.brightness = 254;

                if (light.type === "Color light" || light.type === "Extended color light") {
                    light.saturation = 0;
                }
            } else {
                console.log("Turning it on, in night mode!");
                light.on = true;
                light.brightness = 254;

                if (light.type === "Color light" || light.type === "Extended color light") {
                    light.hue = 46920; // blue
                    light.saturation = 254;
                }
            }
            await client.lights.save(light);
        }
    }
}

async function main() {
    const config: Config = JSON.parse(fs.readFileSync("config.json").toString());

    // find the bridge
    if (!config.bridgeIp) {
        const bridges = await huejay.discover();
        if (bridges.length === 0) {
            throw new Error("No bridges found");
        }
        for (const b of bridges) {
            console.log(" + Found " + b.id + " at " + b.ip);
        }

        const bridge = bridges[0];
        console.log("Using bridge " + bridge.id + " at " + bridge.ip);

        config.bridgeIp = bridge.ip;
    }

    // get a new user if needed
    if (!config.username) {
        console.log("No username provided, trying to register a new one");

        const cli = new huejay.Client({
            host: config.bridgeIp
        });

        const user = new cli.users.User;
        user.deviceType = "Farbton";

        const u = await cli.users.create(user);
        console.log("New user is: " + u.username);

        config.username = u.username
    }

    // create the real client and check auth
    const client = new huejay.Client({
        host: config.bridgeIp,
        username: config.username
    });

    console.log("Checking bridge auth ...");
    const authOk = await client.bridge.isAuthenticated();
    if (!authOk) {
        console.log("Not authenticated.");
        return;
    }

    await loop(client, config);
}

async function run() {
    try {
        await main();
    } catch(err) {
        console.error(err);
    }
}

run();