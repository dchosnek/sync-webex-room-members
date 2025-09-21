/**
 * Sync Webex Room Memberships
 *
 * This script synchronizes members between two Webex rooms using the Webex REST API.
 * It compares the list of members in a source room against the destination room
 * and adds any missing members to the destination.
 *
 * Usage:
 *   - Locally: Define WEBEX_TOKEN, SRC_ROOM_ID, and DST_ROOM_ID in a `.env` file
 *              or your shell environment, then run:
 *                  node index.js
 *   - AWS Lambda: Configure the same variables as Lambda environment variables.
 *                 The function exports `handler` for Lambda invocation.
 *
 * Environment Variables:
 *   WEBEX_TOKEN   – A valid Webex access token with `spark:memberships_read` and
 *                   `spark:memberships_write` scopes.
 *   SRC_ROOM_ID   – The Webex room ID to copy members from.
 *   DST_ROOM_ID   – The Webex room ID to add missing members to.
 *
 * Behavior:
 *   1. Fetches all members from the source and destination rooms.
 *   2. Determines which source members are not already in the destination (inline diff).
 *   3. Adds missing members to the destination room in parallel.
 *   4. Returns a summary of attempted, added, and failed operations.
 *
 * Architecture:
 *
 *   +------------------+         getMembers()           +--------------------+
 *   |   Source Room    | -----------------------------> |  srcMembers array  |
 *   +------------------+                                +--------------------+
 *                                                           |
 *                                                           |  main(): build Set(personId from dstMembers)
 *                                                           |         filter srcMembers by personId not in Set
 *                                                           v
 *   +------------------+         getMembers()           +--------------------+
 *   | Destination Room | -----------------------------> |  dstMembers array  |
 *   +------------------+                                +--------------------+
 *                                                           |
 *                                                           |  (inline diff by personId inside main)
 *                                                           v
 *   +-------------------------------------------+
 *   |  Missing members (toAdd)                  |
 *   +-------------------------------------------+
 *                       |
 *                       | addMember() in parallel (Promise.allSettled)
 *                       v
 *   +---------------------------+
 *   | Destination Room Updated  |
 *   +---------------------------+
 */


// Load environment variables from .env file only when NOT running in Lambda
if (!process.env.AWS_LAMBDA_FUNCTION_NAME) {
    // eslint-disable-next-line global-require
    require('dotenv').config();
}

const srcRoom = process.env.SRC_ROOM_ID;
const dstRoom = process.env.DST_ROOM_ID;
const webexToken = process.env.WEBEX_TOKEN;
const sendReportTo = process.env.SEND_RESULTS ?? "";

/**
 * Retrieves the list of memberships (room members) from the Webex API for a given room.
 *
 * @async
 * @function getMembers
 * @param {string} token - A valid Webex access token (Bearer token).
 * @param {string} roomId - The ID of the Webex room to query.
 * @returns {Promise<Array<Object>>} Resolves to an array of membership objects, each
 *   representing a person in the room. Throws an error if the HTTP request fails.
 *
 * @throws {Error} If the HTTP response is not OK (non-2xx status).
 */
async function getMembers(token, roomId) {
    const response = await fetch(
        `https://webexapis.com/v1/memberships?roomId=${roomId}&max=1000`,
        {
            method: "GET",
            headers: {
                Authorization: `Bearer ${token}`,
            },
        }
    );

    if (!response.ok) {
        throw new Error(`HTTP error ${response.status}`);
    }

    const data = await response.json();
    return data.items;   // <-- array of memberships
}

/**
 * Adds a person to a Webex room by creating a membership.
 *
 * @async
 * @function addMember
 * @param {string} token - A valid Webex access token (Bearer token) with `spark:memberships_write` scope.
 * @param {string} roomId - The ID of the Webex room to add the person to.
 * @param {string} personId - The Webex person ID of the user to add (use `personEmail` instead if you want to add by email).
 * @returns {Promise<boolean>} Resolves to `true` if the membership was created successfully.
 * @throws {Error} If the HTTP request fails (non-2xx response), includes the status code and error details from Webex.
 */
async function addMember(token, roomId, personId) {
    const response = await fetch("https://webexapis.com/v1/memberships", {
        method: "POST",
        headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            roomId,
            personId,
        }),
    });

    if (!response.ok) {
        const text = await response.text();
        throw new Error(`HTTP ${response.status} – ${text}`);
    }

    return true;
}

/**
 * Format results into Markdown and send them to a Webex user by email.
 *
 * @param {string} token - Webex access token with spark:messages_write scope.
 * @param {string} email - Email address of the user to message.
 * @param {Object} results - Summary results from main().
 * @returns {Promise<Object>} Resolves with the Webex API response JSON.
 */
async function sendReport(token, email, results) {
  // Build Markdown summary
  let markdown = "**Membership updates**\n";
  markdown += "```json\n";
  markdown += JSON.stringify(results, null, 2);
  markdown += "\n```";

  // POST to Webex messages API
  const response = await fetch("https://webexapis.com/v1/messages", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      toPersonEmail: email,
      markdown: markdown,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`HTTP ${response.status} – ${text}`);
  }

  return response.json();
}


async function main() {

    // get list of members in both rooms and determine which ones to add to
    // the destination room
    const [srcMembers, dstMembers] = await Promise.all([
        getMembers(webexToken, srcRoom),
        getMembers(webexToken, dstRoom)
    ]);

    // create a list of members missing from the destination room (need to be added)
    const dstMemberIds = new Set(dstMembers.map(item => item.personId));
    const toAdd = srcMembers.filter(item => !dstMemberIds.has(item.personId));

    // Add in parallel, but collect per-member results
    const results = await Promise.allSettled(
        toAdd.map(member => addMember(webexToken, dstRoom, member.personId))
    );

    report = {
        attempted: toAdd.length,
        added: results.filter(r => r.status === 'fulfilled').length,
        failed: results
            .map((r, i) => (r.status === 'rejected' ? { personId: toAdd[i].personDisplayName, error: String(r.reason) } : null))
            .filter(Boolean),
    };

    // send the report of the results via Webex to the list of people whose
    // emails are specified in the environment variable
    sendReportTo
        .split(",")
        .map(s => s.trim())
        .filter(Boolean) // removes "", null, undefined
        .map(email => sendReport(webexToken, email, report));

    return report;

}

// --- Local CLI runner: `node index.js` ---
if (require.main === module) {
    (async () => {
        try {
            const out = await main();
            console.log(JSON.stringify(out, null, 2));
        } catch (e) {
            console.error(e);
            process.exit(1);
        }
    })();
}

// --- AWS Lambda entry point ---
exports.handler = async (event) => {
    try {
        const result = await main({ webexToken, srcRoom, dstRoom });
        return {
            statusCode: 200,
            body: JSON.stringify(result),
        };
    } catch (err) {
        return {
            statusCode: 500,
            body: JSON.stringify({ error: String(err.message ?? err) }),
        };
    }
};