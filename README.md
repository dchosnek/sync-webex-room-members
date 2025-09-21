# Sync members between two Webex rooms

This script performs a **uni-directional** sync of the list of members between two rooms. In other words, it adds people to the *destination* room who are in the *source* room. Obviously it does not try to add people who are already there.

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

