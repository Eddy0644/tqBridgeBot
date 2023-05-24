module.exports = {
    STypes: {
        Chat: 1,
        FindMode: 2,
    },
    Config: {
        TGBotCommands: [
            {command: '/find', description: 'Find Person or Group Chat'},
            {command: '/clear', description: 'Clear Selection'},
            {command: '/info', description: 'Get current system variables'},
            {command: '/placeholder', description: 'Display a placeholder to hide former messages'},
            {command: '/slet', description: 'Set last explicit talker as last talker.'},
            {command: '/keyboard', description: 'Get a persistent versatile quick keyboard.'},
            {command: '/log', description: 'Get a copy of program verbose log of 1000 chars by default.'},
            {command: '/lock', description: 'Lock the target talker to avoid being interrupted.'},
            {command: '/spoiler', description: 'Add spoiler to the replied message.'},
            // Add more commands as needed
        ],
        placeholder: `Start---\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\nStop----`,
    }
}