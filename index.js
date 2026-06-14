const {
  Client,
  GatewayIntentBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  EmbedBuilder,
  StringSelectMenuBuilder
} = require('discord.js')

const mineflayer = require('mineflayer')
const http = require('http')

http.createServer((req, res) => {
  res.write('alive!')
  res.end()
}).listen(3000)

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
})

const PANEL_CHANNEL_ID = '1513495154151915530'
const STATUS_CHANNEL_ID = '1513496686352142527'
const MAX_SLOTS = 7
const DEFAULT_MC_PORT = 25565

const registrations = new Map()

function getUserBots(userId) {
  if (!registrations.has(userId)) registrations.set(userId, [])
  return registrations.get(userId)
}

function parseServerAddress(address) {
  const cleanAddress = address.trim()
  if (!cleanAddress) return null

  const lastColonIndex = cleanAddress.lastIndexOf(':')

  if (lastColonIndex > -1 && lastColonIndex === cleanAddress.indexOf(':')) {
    const ip = cleanAddress.slice(0, lastColonIndex).trim()
    const portText = cleanAddress.slice(lastColonIndex + 1).trim()
    const port = Number(portText)

    if (!ip || !Number.isInteger(port) || port < 1 || port > 65535) return null
    return { ip, port }
  }

  return {
    ip: cleanAddress,
    port: DEFAULT_MC_PORT
  }
}

function buildBotModal(customId, title, bot = {}) {
  const modal = new ModalBuilder()
    .setCustomId(customId)
    .setTitle(title)

  const nameInput = new TextInputBuilder()
    .setCustomId('botName')
    .setLabel('Bot Username')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)

  const addressInput = new TextInputBuilder()
    .setCustomId('botAddress')
    .setLabel('Server IP / Host')
    .setPlaceholder('example.com or example.com:12345')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)

  const command1Input = new TextInputBuilder()
    .setCustomId('command1')
    .setLabel('Command 1')
    .setPlaceholder('/register password password')
    .setStyle(TextInputStyle.Short)
    .setRequired(false)

  const command2Input = new TextInputBuilder()
    .setCustomId('command2')
    .setLabel('Command 2')
    .setPlaceholder('/login password')
    .setStyle(TextInputStyle.Short)
    .setRequired(false)

  const shouldMoveInput = new TextInputBuilder()
    .setCustomId('shouldMove')
    .setLabel('Bot should move?')
    .setPlaceholder('Type yes to enable random movement')
    .setStyle(TextInputStyle.Short)
    .setRequired(false)

  const commands = bot.commands || []

  if (bot.name) nameInput.setValue(bot.name)
  if (bot.ip) addressInput.setValue(`${bot.ip}:${bot.port}`)
  if (commands[0]) command1Input.setValue(commands[0])
  if (commands[1]) command2Input.setValue(commands[1])
  if (bot.shouldMove) shouldMoveInput.setValue('yes')

  modal.addComponents(
    new ActionRowBuilder().addComponents(nameInput),
    new ActionRowBuilder().addComponents(addressInput),
    new ActionRowBuilder().addComponents(command1Input),
    new ActionRowBuilder().addComponents(command2Input),
    new ActionRowBuilder().addComponents(shouldMoveInput)
  )

  return modal
}

function buildAddCommandModal(index) {
  const modal = new ModalBuilder()
    .setCustomId(`add_command_modal_${index}`)
    .setTitle('Add Command')

  const commandInput = new TextInputBuilder()
    .setCustomId('newCommand')
    .setLabel('Command')
    .setPlaceholder('/arena')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)

  modal.addComponents(
    new ActionRowBuilder().addComponents(commandInput)
  )

  return modal
}

client.on('ready', () => {
  console.log(`Bot online as ${client.user.tag}!`)
})

client.on('messageCreate', async (message) => {
  if (message.author.bot) return
  if (message.channel.id !== PANEL_CHANNEL_ID) return
  if (message.content !== '!panel') return

  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('register')
      .setLabel('Register')
      .setStyle(ButtonStyle.Primary),

    new ButtonBuilder()
      .setCustomId('manage')
      .setLabel('Edit Registration')
      .setStyle(ButtonStyle.Secondary),

    new ButtonBuilder()
      .setCustomId('status')
      .setLabel('Status')
      .setStyle(ButtonStyle.Success),

    new ButtonBuilder()
      .setCustomId('delete_all')
      .setLabel('Delete')
      .setStyle(ButtonStyle.Danger)
  )

  const embed = new EmbedBuilder()
    .setTitle('Bot Control Panel')
    .setDescription('Register and manage up to 7 Minecraft bots.')
    .setColor(0x9B59B6)
    .setTimestamp()

  await message.channel.send({
    embeds: [embed],
    components: [row1]
  })
})

client.on('interactionCreate', async (interaction) => {
  if (interaction.isButton()) {
    const userId = interaction.user.id
    const bots = getUserBots(userId)

    if (interaction.customId === 'register') {
      if (bots.length >= MAX_SLOTS) {
        return interaction.reply({
          content: 'You already used all 7 registration slots.',
          ephemeral: true
        })
      }

      return interaction.showModal(buildBotModal('register_modal', 'Register Bot'))
    }

    if (interaction.customId === 'manage') {
      if (!bots.length) {
        return interaction.reply({
          content: 'You have no registrations yet.',
          ephemeral: true
        })
      }

      const menu = new StringSelectMenuBuilder()
        .setCustomId('select_bot')
        .setPlaceholder('Choose a registration')
        .addOptions(
          bots.map((bot, index) => ({
            label: `${index + 1}. ${bot.name}`,
            description: `${bot.ip}:${bot.port}`,
            value: String(index)
          }))
        )

      return interaction.reply({
        content: 'Choose which registration you want to manage.',
        components: [new ActionRowBuilder().addComponents(menu)],
        ephemeral: true
      })
    }

    if (interaction.customId === 'status') {
      if (!bots.length) {
        return interaction.reply({
          content: 'You have no registrations yet.',
          ephemeral: true
        })
      }

      const text = bots.map((bot, index) => {
        const state = bot.bot ? 'Online' : 'Offline'
        const commands = bot.commands && bot.commands.length
          ? bot.commands.map((cmd, cmdIndex) => `${cmdIndex + 1}. ${cmd}`).join('\n')
          : 'No commands saved'

        return `Slot ${index + 1}: ${bot.name}\nServer: ${bot.ip}:${bot.port}\nStatus: ${state}\nRandom Movement: ${bot.shouldMove ? 'Yes' : 'No'}\nCommands:\n${commands}`
      }).join('\n\n')

      return interaction.reply({
        content: text,
        ephemeral: true
      })
    }

    if (interaction.customId === 'delete_all') {
      for (const bot of bots) cleanupBot(bot)
      registrations.set(userId, [])

      return interaction.reply({
        content: 'All your registrations were deleted.',
        ephemeral: true
      })
    }

    if (interaction.customId.startsWith('start_')) {
      const index = Number(interaction.customId.split('_')[1])
      const bot = bots[index]

      if (!bot) {
        return interaction.reply({
          content: 'That registration no longer exists.',
          ephemeral: true
        })
      }

      if (bot.bot) {
        return interaction.reply({
          content: 'That bot is already running.',
          ephemeral: true
        })
      }

      startBot(bot)

      return interaction.reply({
        content: `Starting ${bot.name}.`,
        ephemeral: true
      })
    }

    if (interaction.customId.startsWith('stop_')) {
      const index = Number(interaction.customId.split('_')[1])
      const bot = bots[index]

      if (!bot) {
        return interaction.reply({
          content: 'That registration no longer exists.',
          ephemeral: true
        })
      }

      if (!bot.bot) {
        return interaction.reply({
          content: 'That bot is already offline.',
          ephemeral: true
        })
      }

      cleanupBot(bot)

      return interaction.reply({
        content: `Stopped ${bot.name}.`,
        ephemeral: true
      })
    }

    if (interaction.customId.startsWith('delete_')) {
      const index = Number(interaction.customId.split('_')[1])
      const bot = bots[index]

      if (!bot) {
        return interaction.reply({
          content: 'That registration no longer exists.',
          ephemeral: true
        })
      }

      cleanupBot(bot)
      bots.splice(index, 1)

      return interaction.reply({
        content: `Deleted registration ${index + 1}.`,
        ephemeral: true
      })
    }

    if (interaction.customId.startsWith('edit_')) {
      const index = Number(interaction.customId.split('_')[1])
      const bot = bots[index]

      if (!bot) {
        return interaction.reply({
          content: 'That registration no longer exists.',
          ephemeral: true
        })
      }

      return interaction.showModal(buildBotModal(`edit_modal_${index}`, 'Edit Registration', bot))
    }

    if (interaction.customId.startsWith('addcmd_')) {
      const index = Number(interaction.customId.split('_')[1])
      const bot = bots[index]

      if (!bot) {
        return interaction.reply({
          content: 'That registration no longer exists.',
          ephemeral: true
        })
      }

      return interaction.showModal(buildAddCommandModal(index))
    }
  }

  if (interaction.isStringSelectMenu()) {
    if (interaction.customId !== 'select_bot') return

    const userId = interaction.user.id
    const bots = getUserBots(userId)
    const index = Number(interaction.values[0])
    const bot = bots[index]

    if (!bot) {
      return interaction.reply({
        content: 'That registration no longer exists.',
        ephemeral: true
      })
    }

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`start_${index}`)
        .setLabel('Start')
        .setStyle(ButtonStyle.Success),

      new ButtonBuilder()
        .setCustomId(`stop_${index}`)
        .setLabel('Stop')
        .setStyle(ButtonStyle.Danger),

      new ButtonBuilder()
        .setCustomId(`edit_${index}`)
        .setLabel('Edit')
        .setStyle(ButtonStyle.Primary),

      new ButtonBuilder()
        .setCustomId(`addcmd_${index}`)
        .setLabel('+ Add Cmd')
        .setStyle(ButtonStyle.Secondary),

      new ButtonBuilder()
        .setCustomId(`delete_${index}`)
        .setLabel('Delete')
        .setStyle(ButtonStyle.Danger)
    )

    const commands = bot.commands && bot.commands.length
      ? bot.commands.map((cmd, cmdIndex) => `${cmdIndex + 1}. ${cmd}`).join('\n')
      : 'No commands saved'

    return interaction.reply({
      content: `Selected slot ${index + 1}: ${bot.name}\nServer: ${bot.ip}:${bot.port}\nStatus: ${bot.bot ? 'Online' : 'Offline'}\nRandom Movement: ${bot.shouldMove ? 'Yes' : 'No'}\nCommands:\n${commands}`,
      components: [row],
      ephemeral: true
    })
  }

  if (interaction.isModalSubmit()) {
    const userId = interaction.user.id
    const bots = getUserBots(userId)

    if (interaction.customId.startsWith('add_command_modal_')) {
      const index = Number(interaction.customId.split('_')[3])
      const bot = bots[index]

      if (!bot) {
        return interaction.reply({
          content: 'That registration no longer exists.',
          ephemeral: true
        })
      }

      const newCommand = interaction.fields.getTextInputValue('newCommand').trim()

      if (!newCommand) {
        return interaction.reply({
          content: 'Command cannot be empty.',
          ephemeral: true
        })
      }

      if (!bot.commands) bot.commands = []
      bot.commands.push(newCommand)

      return interaction.reply({
        content: `Added command ${bot.commands.length}: ${newCommand}`,
        ephemeral: true
      })
    }

    const name = interaction.fields.getTextInputValue('botName').trim()
    const address = interaction.fields.getTextInputValue('botAddress').trim()
    const command1 = interaction.fields.getTextInputValue('command1').trim()
    const command2 = interaction.fields.getTextInputValue('command2').trim()
    const shouldMoveText = interaction.fields.getTextInputValue('shouldMove').trim()
    const shouldMove = shouldMoveText.toLowerCase() === 'yes'
    const parsedAddress = parseServerAddress(address)

    if (!name) {
      return interaction.reply({
        content: 'Bot username cannot be empty.',
        ephemeral: true
      })
    }

    if (!parsedAddress) {
      return interaction.reply({
        content: 'Server address cannot be empty. You can use a host, IP, or host:port.',
        ephemeral: true
      })
    }

    const { ip, port } = parsedAddress
    const commands = [command1, command2].filter(Boolean)

    if (interaction.customId === 'register_modal') {
      if (bots.length >= MAX_SLOTS) {
        return interaction.reply({
          content: 'You already used all 7 registration slots.',
          ephemeral: true
        })
      }

      bots.push({
        name,
        ip,
        port,
        commands,
        shouldMove,
        bot: null,
        afkInterval: null,
        movementTimeout: null,
        reconnectTimer: null,
        stopping: false
      })

      return interaction.reply({
        content: `Registered slot ${bots.length}.\nName: ${name}\nServer: ${ip}:${port}\nRandom Movement: ${shouldMove ? 'Yes' : 'No'}`,
        ephemeral: true
      })
    }

    if (interaction.customId.startsWith('edit_modal_')) {
      const index = Number(interaction.customId.split('_')[2])
      const bot = bots[index]

      if (!bot) {
        return interaction.reply({
          content: 'That registration no longer exists.',
          ephemeral: true
        })
      }

      cleanupBot(bot)

      bot.name = name
      bot.ip = ip
      bot.port = port
      bot.commands = commands.concat((bot.commands || []).slice(2))
      bot.shouldMove = shouldMove

      return interaction.reply({
        content: `Updated slot ${index + 1}.\nName: ${name}\nServer: ${ip}:${port}\nRandom Movement: ${shouldMove ? 'Yes' : 'No'}`,
        ephemeral: true
      })
    }
  }
})

function stopRandomMovement(registration) {
  if (registration.afkInterval) {
    clearTimeout(registration.afkInterval)
    registration.afkInterval = null
  }

  if (registration.movementTimeout) {
    clearTimeout(registration.movementTimeout)
    registration.movementTimeout = null
  }

  if (registration.bot) {
    for (const control of ['forward', 'back', 'left', 'right', 'jump', 'sneak']) {
      registration.bot.setControlState(control, false)
    }
  }
}

function cleanupBot(registration) {
  registration.stopping = true
  stopRandomMovement(registration)

  if (registration.reconnectTimer) {
    clearTimeout(registration.reconnectTimer)
    registration.reconnectTimer = null
  }

  if (registration.bot) {
    registration.bot.removeAllListeners()

    try {
      registration.bot.quit()
    } catch {}

    registration.bot = null
  }
}

function startRandomMovement(registration, bot) {
  stopRandomMovement(registration)

  const controls = ['forward', 'back', 'left', 'right', 'jump', 'sneak']
  const moveOptions = [
    ['forward'],
    ['forward', 'left'],
    ['forward', 'right'],
    ['back'],
    ['left'],
    ['right']
  ]

  const scheduleMove = () => {
    if (!registration.bot || registration.bot !== bot) return

    const waitTime = 4000 + Math.floor(Math.random() * 5000)

    registration.afkInterval = setTimeout(() => {
      if (!registration.bot || registration.bot !== bot) return

      for (const control of controls) {
        bot.setControlState(control, false)
      }

      const movement = moveOptions[Math.floor(Math.random() * moveOptions.length)]

      for (const control of movement) {
        bot.setControlState(control, true)
      }

      if (Math.random() < 0.35) {
        bot.setControlState('jump', true)
      }

      if (bot.entity) {
        const yaw = bot.entity.yaw + (Math.random() - 0.5) * Math.PI

        try {
          bot.look(yaw, bot.entity.pitch, true)
        } catch {}
      }

      const moveTime = 1000 + Math.floor(Math.random() * 2000)

      registration.movementTimeout = setTimeout(() => {
        if (!registration.bot || registration.bot !== bot) return

        for (const control of controls) {
          bot.setControlState(control, false)
        }

        scheduleMove()
      }, moveTime)
    }, waitTime)
  }

  scheduleMove()
}

function startBot(registration) {
  cleanupBot(registration)

  registration.stopping = false

  const bot = mineflayer.createBot({
    host: registration.ip,
    port: registration.port,
    username: registration.name,
    version: '1.20.1',
    auth: 'offline',
    viewDistance: 1
  })

  registration.bot = bot

  bot.once('spawn', async () => {
    console.log(`${registration.name} is online!`)

    try {
      const channel = client.channels.cache.get(STATUS_CHANNEL_ID)
      if (channel) {
        await channel.send(`${registration.name} is online!\n${registration.ip}:${registration.port}`)
      }
    } catch {}

    runStartupCommands(registration, bot)
  })

  const handleDisconnect = async (reason) => {
    if (registration.stopping) return

    stopRandomMovement(registration)
    registration.bot = null

    try {
      const channel = client.channels.cache.get(STATUS_CHANNEL_ID)
      const reasonText = formatReason(reason)

      if (channel) {
        await channel.send(`${registration.name} disconnected.\n${registration.ip}:${registration.port}\nReason: ${reasonText}`)
      }
    } catch {}

    if (!registration.reconnectTimer) {
      registration.reconnectTimer = setTimeout(() => {
        registration.reconnectTimer = null
        startBot(registration)
      }, 60000)
    }
  }

  bot.on('kicked', handleDisconnect)
  bot.on('error', handleDisconnect)
  bot.on('end', handleDisconnect)
}

function runStartupCommands(registration, bot) {
  const commands = registration.commands || []

  const runCommand = (index) => {
    if (!registration.bot || registration.bot !== bot) return

    if (index >= commands.length) {
      if (registration.shouldMove) {
        startRandomMovement(registration, bot)
      } else {
        stopRandomMovement(registration)
      }
      return
    }

    bot.chat(commands[index])

    setTimeout(() => {
      runCommand(index + 1)
    }, 2000)
  }

  setTimeout(() => {
    runCommand(0)
  }, 3000)
}

function formatReason(reason) {
  if (!reason) return 'Unknown'
  if (typeof reason === 'string') return reason
  if (reason.message) return reason.message

  try {
    return JSON.stringify(reason)
  } catch {
    return String(reason)
  }
}

if (!process.env.TOKEN) {
  console.error('Missing TOKEN environment variable.')
  process.exit(1)
}

client.login(process.env.TOKEN)
