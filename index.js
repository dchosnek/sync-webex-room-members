
// Load environment variables from .env file only when NOT running in Lambda
if (!process.env.AWS_LAMBDA_FUNCTION_NAME) {
    // eslint-disable-next-line global-require
    require('dotenv').config();
}

const srcRoom = process.env.WEBEX_SRC_ROOM;
const dstRoom = process.env.WEBEX_DST_ROOM;
const webexToken = process.env.WEBEX_TOKEN;

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
 *
 * @example
 * const members = await getMembers(process.env.WEBEX_TOKEN, "Y2lzY29...");
 * console.log(members[0].personEmail); // logs the email of the first member
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
 *
 * @example
 * try {
 *   const success = await addMember(process.env.WEBEX_TOKEN, "Y2lzY29...", "Y2lzY29zcGFyazovL3VzZXIv1234");
 *   if (success) {
 *     console.log("Member added successfully");
 *   }
 * } catch (err) {
 *   console.error("Failed to add member:", err.message);
 * }
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
 * Returns all membership objects from list1 whose `personId` does not exist in list2.
 *
 * @param {Array<Object>} list1 - Array of membership objects (with a `personId` field).
 * @param {Array<Object>} list2 - Array of membership objects (with a `personId` field).
 * @returns {Array<Object>} Filtered array of membership objects from list1.
 *
 * @example
 * const unique = getUniqueByPersonId(membersSrc, membersDst);
 */
function getUniqueByPersonId(list1, list2) {
    // Build a Set of all personIds in list2 for fast lookup
    const idsInList2 = new Set(list2.map(item => item.personId));

    // Keep only those objects from list1 whose personId is not in list2
    return list1.filter(item => !idsInList2.has(item.personId));
}

async function main() {

    // get list of members in both rooms and determine which ones to add to
    // the destination room
    const [membersSrc, membersDst] = await Promise.all([
        getMembers(webexToken, srcRoom),
        getMembers(webexToken, dstRoom)
    ]);
    const membersToAdd = (getUniqueByPersonId(membersSrc, membersDst));
    console.log("members to add = " + membersToAdd.length);

    // console.log(membersToAdd.map(item => item.personDisplayName))

    // Add in parallel, but collect per-member results
    const results = await Promise.allSettled(
        membersToAdd.map(member => addMember(webexToken, dstRoom, member.personId))
    );
    return {
        attempted: membersToAdd.length,
        added: results.filter(r => r.status === 'fulfilled').length,
        failed: results
            .map((r, i) => (r.status === 'rejected' ? { personId: toAdd[i].personId, error: String(r.reason) } : null))
            .filter(Boolean),
    };

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