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

	setInterval(async () => {
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

						try {
							await setPanelColor(app.panelId, color, nanoleafBaseUrl, nanoleafAuthToken);
						} catch (err) {
							console.error("ERROR SETTING PANEL COLOR", err);
						}
					}
				} catch (err) {
					console.error("ERROR PARSING DATA", err);
				}
			}
		} catch (err) {
			console.error("ERROR FETCHING COUNTERS", err);
		}
	}, 1000);
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
		return [51, 51, 255]; // blue
	} else {
		return [255, 51, 153]; // pink
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
