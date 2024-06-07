import { Env, loadEnv } from "@hedia/env";

main().catch((err) => console.error(err));

async function main() {
	await loadEnv();
	const nanoleafBaseUrl = Env.getURL("NANOLEAF_BASE_URL");
	const nanoleafAuthToken = Env.getString("NANOLEAF_AUTH_TOKEN");

	const apps = {
		"hedia-com-oauth2": {
			panelId: 51890,
			count: 0,
		},
		"hedia-com-developer": {
			panelId: 34924,
			count: 0,
		},
		"hedia-com-id": {
			panelId: 26826,
			count: 0,
		},
		"hedia-com-data": {
			panelId: 50223,
			count: 0,
		},
		"hedia-com-event": {
			panelId: 61943,
			count: 0,
		},
		"hedia-com-webhook": {
			panelId: 62639,
			count: 0,
		},
	};

	while (true) {
		try {
			const eventStream = fetchEventStream("https://scalingo.hedia.org/counters");

			for await (const event of eventStream) {
				try {
					const counters = JSON.parse(event.data);

					for (const appname in apps) {
						const app = apps[appname];

						const newCount = counters?.app?.[appname]?.count ?? 0;

						const diff = newCount - app.count;

						app.count = newCount;

						const color = getColor(diff);

						if (diff > 0) {
							console.log(appname, diff, color);
						}

						await setPanelColor(app.panelId, color, nanoleafBaseUrl, nanoleafAuthToken);
					}
				} catch (err) {
					console.error(err);

					await sleep(1000);
				}
			}
		} catch (err) {
			console.error(err);

			await sleep(1000);
		}
	}
}

async function* fetchEventStream(url) {
	const response = await fetch(url);
	const reader = response.body.getReader({});
	const decoder = new TextDecoder("utf-8");

	let message = "";

	while (true) {
		const { value, done } = await reader.read();

		if (done) {
			break;
		}

		const text = decoder.decode(value);

		if (typeof text !== "string") {
			continue;
		}

		message += text;

		if (message.endsWith("\n\n")) {
			yield parseValue(message);

			message = "";
		}
	}

	function parseValue(value) {
		if (typeof value !== "string") {
			return null;
		}

		const lines = value.split("\n");

		return lines
			.map((line) => splitOnFirst(line, ": "))
			.reduce((event, [key, value]) => {
				if (key === "event" || key === "data") {
					event[key] = value;
				}

				return event;
			}, {});
	}

	function splitOnFirst(value, separator) {
		const index = value.indexOf(separator);
		return [value.slice(0, index), value.slice(index + separator.length)];
	}
}

function getColor(count) {
	if (count === 0) {
		return [51, 51, 255];
	} else {
		return [255, 51, 153];
	}
}

async function discover() {
	console.log("discover");

	const ips = new Array(255).fill(null).map((i, index) => `192.168.1.${index + 1}`);

	await Promise.all(ips.map(checkIp));

	async function checkIp(ip) {
		const url = `http://${ip}/api/v1/new`;

		try {
			const response = await fetch(url, { method: "POST" });

			if (!response.ok) {
				throw new Error(response.status);
			}

			console.log(url, response.status);
		} catch (err) {
			console.error(url, err.message);
		}
	}
}

async function setPanelColor(panelId, [red, green, blue], nanoleafBaseUrl, nanoleafAuthToken) {
	console.log("setPanelColor");

	await writeEffect(
		{
			command: "display",
			animType: "static",
			animData: `1 ${panelId} 1 ${red} ${green} ${blue} 0 0`,
			loop: false,
			palette: [],
		},
		nanoleafBaseUrl,
		nanoleafAuthToken,
	);
}

async function getnanoleafAuthToken(nanoleafBaseUrl) {
	const input = new URL("/api/v1/new", nanoleafBaseUrl);

	const response = await fetch(nanoleafBaseUrl, { method: "POST" });

	console.log(response.status, await response.json());
}

async function identify(nanoleafBaseUrl, nanoleafAuthToken) {
	console.log("identify");

	const input = new URL(`/api/v1/${nanoleafAuthToken}/identify`, nanoleafBaseUrl);

	await fetch(input, { method: "PUT" });
}

async function getAllPanelInfo(nanoleafBaseUrl, nanoleafAuthToken) {
	console.log("getAllPanelInfo");

	const input = new URL(`/api/v1/${nanoleafAuthToken}/`, nanoleafBaseUrl);

	const response = await fetch(input, { method: "GET" });

	return response.json();
}

async function writeEffect(effect, nanoleafBaseUrl, nanoleafAuthToken) {
	console.log("writeEffect");

	const input = new URL(`/api/v1/${nanoleafAuthToken}/effects`, nanoleafBaseUrl);

	const response = await fetch(input, {
		method: "PUT",
		headers: {
			"Content-Type": "application/json",
		},
		body: JSON.stringify({
			write: effect,
		}),
	});

	console.log(await response.status);
}

async function sleep(ms) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function getRandomItem(array) {
	return array[Math.floor(Math.random() * array.length)];
}
