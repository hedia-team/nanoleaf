import { Env, loadEnv } from "@hedia/env";

const BLUE = [51, 51, 255];
const PINK = [255, 51, 153];

main().catch((err) => console.error(err));

async function main() {
	await loadEnv();
	const nanoleafBaseUrl = Env.getURL("NANOLEAF_BASE_URL");
	const nanoleafAuthToken = Env.getString("NANOLEAF_AUTH_TOKEN");

	const apps = {
		"hedia-com-oauth2": {
			panelId: 51890,
			count: 0,
			color: BLUE,
		},
		"hedia-com-developer": {
			panelId: 34924,
			count: 0,
			color: BLUE,
		},
		"hedia-com-id": {
			panelId: 26826,
			count: 0,
			color: BLUE,
		},
		"hedia-com-data": {
			panelId: 50223,
			count: 0,
			color: BLUE,
		},
		"hedia-com-event": {
			panelId: 61943,
			count: 0,
			color: BLUE,
		},
		"hedia-com-webhook": {
			panelId: 62639,
			count: 0,
			color: BLUE,
		},
	};

	try {
		const eventStream = fetchEventStream("https://scalingo.hedia.org/counters");

		for await (const event of eventStream) {
			try {
				const counters = JSON.parse(event.data);

				for (const appname in apps) {
					const app = apps[appname];
					const newCount = counters?.app?.[appname]?.count ?? 0;
					const diff = newCount - app.count;

					if (diff > 0) {
						console.log(`\nApp ${appname} was ${app.count}, now ${newCount}`);
						app.count = newCount;
					}

					const color = getColor(diff);
					if (color !== app.color) {
						console.log(`Setting ${appname} color to ${color}`);
						try {
							await setPanelColor(app.panelId, color, nanoleafBaseUrl, nanoleafAuthToken);
							app.color = color;
						} catch (err) {
							console.error("Error setting panel color:", err);
							sleep(1000);
						}
					}
				}
			} catch (err) {
				console.error("Error parsing event data:", err);
				sleep(1000);
			}
		}
	} catch (err) {
		console.error("Error fetching event stream:", err);
		sleep(1000);
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
		return BLUE;
	} else {
		return PINK;
	}
}

async function setPanelColor(panelId, [red, green, blue], nanoleafBaseUrl, nanoleafAuthToken) {
	await writeEffect(
		{
			command: "display",
			animType: "static",
			animData: `1 ${panelId} 1 ${red} ${green} ${blue} 0 0`,
			loop: false,
			palette: [],
			transTime: {
				minValue: 50,
				maxValue: 100,
			},
		},
		nanoleafBaseUrl,
		nanoleafAuthToken,
	);
}

async function writeEffect(effect, nanoleafBaseUrl, nanoleafAuthToken) {
	const input = new URL(`/api/v1/${nanoleafAuthToken}/effects`, nanoleafBaseUrl);

	await fetch(input, {
		method: "PUT",
		headers: {
			"Content-Type": "application/json",
		},
		body: JSON.stringify({
			write: effect,
		}),
	});
}

async function sleep(ms) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}
