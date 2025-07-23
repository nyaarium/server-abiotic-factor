import fs from "fs";
import path from "path";

const regexServerReady = /LogAbiotic: Warning: Session short code: ([A-Z0-9]+)/;
const regexPlayerConnected = /LogAbiotic: Display: CHAT LOG: .* has entered the facility\./;
const regexPlayerDisconnected = /LogAbiotic: Display: CHAT LOG: .* has exited the facility\./;

// Store last read positions for different log files
const logPositions = {};
const logStats = {};
const lineBuffers = {};

function processAdditionalInfo(currentStatus, line) {
	// Extract session code
	const sessionCodeMatch = line.match(regexServerReady);
	if (sessionCodeMatch?.[1]) {
		currentStatus.info["Session Code"] = sessionCodeMatch[1];
	}
}

/**
 * Reads and parses the server log file
 * @param {string} logFilePath - Path to the server log file
 * @returns {Object} Server status object
 */
export function readServerLog(logFilePath) {
	try {
		// Check if file exists
		if (!fs.existsSync(logFilePath)) {
			console.log("⚠️ Log file does not exist:", logFilePath);
			return { status: "unknown", uptime: null };
		}

		// Get file stats
		const stats = fs.statSync(logFilePath);
		const key = path.resolve(logFilePath);

		// Check if file was modified (truncated or rotated)
		const previousStats = logStats[key];
		if (previousStats && stats.size < previousStats.size) {
			delete logPositions[key];
		}

		// Update stored stats
		logStats[key] = stats;

		// Get last position or start at beginning
		let position = logPositions[key] || 0;
		let lineBuffer = lineBuffers[key] || "";

		let newContent = "";

		if (!logStats[`${key}-status`]) {
			try {
				newContent = fs.readFileSync(logFilePath, {
					encoding: "utf8",
					flag: "rs",
				});

				// Set position for next read
				position = stats.size;
				logPositions[key] = position;
			} catch (readError) {
				console.error("⚠️ Error reading log file:", readError);
			}
		} else if (position < stats.size) {
			try {
				// Open file for reading with explicit flags to handle shared access
				const fd = fs.openSync(logFilePath, "rs"); // 'rs' = open for reading in synchronous mode

				// Create buffer for reading
				const bufferSize = Math.min(64 * 1024, stats.size - position);
				const buffer = Buffer.alloc(bufferSize);

				// Read from the last position
				const bytesRead = fs.readSync(fd, buffer, 0, bufferSize, position);
				newContent = buffer.toString("utf8", 0, bytesRead);

				// Update position for next read
				position += bytesRead;
				logPositions[key] = position;

				// Close the file
				fs.closeSync(fd);
			} catch (incrementalError) {
				// Continue with empty content as a fallback
			}
		}

		// Combine buffer with new content and split into complete lines
		const combinedContent = lineBuffer + newContent;
		const lines = combinedContent.split("\n");

		// The last line might be incomplete, save it for next time
		const completeLines = lines.slice(0, -1); // All but the last line
		const incompleteLine = lines[lines.length - 1]; // The last line

		// Store the incomplete line for next read
		lineBuffers[key] = incompleteLine;

		// Process the complete lines
		return processLogContent(completeLines.join("\n"), key);
	} catch (error) {
		console.error("⚠️ Error reading server log:", error);
		return { status: "error", uptime: null, error: error.message };
	}
}

/**
 * Process log content and extract server status information
 * @param {string} content - Log content to process
 * @param {string} key - Unique identifier for the log file
 * @returns {Object} Server status object
 * @example
 * {
 *   "status": "running",
 *   "uptime": {
 *     "iso":"2024-06-24T09:11:11Z",
 *   },
 *   "info": {
 *     "players": 0,
 *   },
 * }
 */
function processLogContent(content, key) {
	// Get existing status or create new one
	let currentStatus = logStats[`${key}-status`] || {
		status: "starting",
		uptime: Math.floor(Date.now() / 1000),
	};

	// Check if we have any meaningful content to process
	const hasContent = content && content.trim();

	// If no new content to process, just return current status
	if (!hasContent) {
		return currentStatus;
	}

	// Check if server is becoming ready
	if (regexServerReady.test(content)) {
		// If this is the first time we're detecting the server as running, update the uptime
		if (currentStatus.status !== "running") {
			console.log(`🔍 Server is ready`);
			currentStatus.status = "running";
			currentStatus.uptime = Math.floor(Date.now() / 1000);
		}
	}

	// Process player connections when server is running
	if (currentStatus.status === "running") {
		// Initialize player info if needed
		if (!currentStatus.info) currentStatus.info = { players: 0 };

		// Count player connects and disconnects in the new content using the predefined regexes
		const connects = (content.match(regexPlayerConnected) || []).length;
		const disconnects = (content.match(regexPlayerDisconnected) || []).length;

		// Only update and log if there's any player activity
		if (connects || disconnects) {
			const oldPlayerCount = currentStatus.info.players;
			currentStatus.info.players += connects;
			currentStatus.info.players = Math.max(0, currentStatus.info.players - disconnects);

			// Only log if the count actually changed
			if (oldPlayerCount !== currentStatus.info.players) {
				console.log(`🔍 Player count updated: ${oldPlayerCount} -> ${currentStatus.info.players}`);
			}
		}
	}

	// Process additional info from each line
	const lines = content.split("\n");
	for (const line of lines) {
		processAdditionalInfo(currentStatus, line);
	}

	// Store the final result
	logStats[`${key}-status`] = currentStatus;

	return currentStatus;
}
