curl -X POST https://7c50-50-221-78-186.ngrok-free.app/send-notification \
    -H "Content-Type: application/json" \
    -d '{
    "appId": "bc97e17cea5f1261000de618f0a87725",
    "title": "MIE Sudo Security Alert",
    "body": "Please review and respond to your pending MIE request in the app.",
    "actions": [
    {
      "icon": "approve",
      "title": "Approve",
      "callback": "approve"
    },
    {
      "icon": "reject",
      "title": "Reject",
      "callback": "reject"
    }
  ]
}'
