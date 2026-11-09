import { createServer } from "node:http";

const body = `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nUID:browser-test\r\nSUMMARY:Browser meeting\r\nDTSTART:20260929T100000Z\r\nDTEND:20260929T110000Z\r\nEND:VEVENT\r\nEND:VCALENDAR`;

createServer((_req, res) => {
	res.setHeader("Content-Type", "text/calendar");
	res.end(body);
}).listen(4401, "127.0.0.1");
