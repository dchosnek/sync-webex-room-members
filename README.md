# Sync members between two Webex rooms

This script performs a **uni-directional** sync of the list of members between two rooms. In other words, it adds people to the *destination* room who are in the *source* room. It does not try to add people who are already members of both rooms.

If you want this to be a **bi-directional** sync, then run the script a second time with the IDs of the room reversed (source becomes destination and destination becomes source).

```
+---------------------------+
|        Start Script       |
+---------------------------+
              |
              v
+---------------------------+
| Load configuration        |
| (environment variables)   |
+---------------------------+
              |
              v
+---------------------------+       +---------------------------+
| Get list of members       |       | Get list of members       |
| from Source room          |       | from Destination room     |
+---------------------------+       +---------------------------+
              |                           |
              +-------------+-------------+
                            |
                            v
               +---------------------------+
               | Compare Source vs Dest    |
               | (find missing people)     |
               +---------------------------+
                            |
                            v
               +---------------------------+
               | Add missing members to    |
               | Destination (parallel)    |
               +---------------------------+
                            |
                            v
               +---------------------------+
               | Summarize results         |
               | (attempted, added, failed)|
               +---------------------------+
                            |
                            v
               +---------------------------+
               |          Finish           |
               +---------------------------+
```

## How to run this script

This single file `index.js` is meant to be run locally or set up as a lambda function in AWS using the CloudFormation template `sync-webex-rooms.yml`.

When running it locally:
1. Clone this repository locally
1. Install Node.js version 22.x
1. Run `npm ci` to install the one package required to run this locally (`dotenv`)
1. Create a local `.env` file with the proper values defined (see the next section of this README for more details)
1. Run `node index.js`

When running this in AWS, simply deploy the CloudFormation template in this repository. You will be prompted for all the values needed to deploy. CloudFormation will deploy this code as lambda function with the proper permisssion and an event trigger to run the lambda once per day.

## Enironment variables

Whether running locally or in AWS, the script depends on environment variables to supply the cusomization that drives the script's performance.
* **WEBEX_TOKEN**: either your token or your bot's token. This token must be able to read membership in both rooms and *add* memebers to the destination room.
* **SRC_ROOM_ID**: id of the source room. Members of this room will be added to the destination room.
* **DST_ROOM_ID**: id of the desintation room. Members will be added to this room.
* **SEND_RESULTS**: comma-delimited list of emails of people who should be notified via Webex every time this script runs. This is an optional field. Leaving it blank or not defining it is allowed.

Here is an example of what the local `.env` file would look like:

```ini
WEBEX_TOKEN=ZSdxN...
SRC_ROOM_ID=Y2lz...
DST_ROOM_ID=Y2lz...
SEND_RESULTS=user1@example.com,user2@example.com
```
