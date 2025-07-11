import { Client, GatewayIntentBits, Message, EmbedBuilder } from "discord.js";

const token = process.env.DISCORD_TOKEN;
const staffRoleName = process.env.STAFF_ROLE_NAME || "Staff";

if (!token) {
  console.error("❌ DISCORD_TOKEN is not set.");
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

// Map to track checked out users: userId -> unix timestamp
const checkoutMap = new Map<string, number>();

// Map to track pings while clocked out: userId -> { by, content, link, time }[]
const pingLog = new Map<
  string,
  {
    by: string;
    content: string;
    link: string;
    time: number;
  }[]
>();

client.once("ready", () => {
  console.log(`✅ Logged in as ${client.user?.tag}`);
});

client.on("messageCreate", async (message: Message) => {
  if (message.author.bot || !message.guild) return;

  const staffRole = message.guild.roles.cache.find(r => r.name === staffRoleName);
  if (!staffRole) return;

  const member = await message.guild.members.fetch(message.author.id);
  const hasStaffRole = member.roles.cache.has(staffRole.id);

  // Commands
  if (message.content === ",checkin") {
    if (!hasStaffRole) return message.reply("❌ You don't have permission to use this command.");
    if (!checkoutMap.has(message.author.id)) return message.reply("✅ You are already checked in.");

    const checkInTime = Math.floor(Date.now() / 1000);
    checkoutMap.delete(message.author.id);

    const pings = pingLog.get(message.author.id);
    pingLog.delete(message.author.id);

    await message.channel.send(`✅ **${message.author.username}** has checked in.`);

    // If they had pings while clocked out, show them in an embed
    if (pings && pings.length > 0) {
      const embed = new EmbedBuilder()
        .setTitle(`📨 Pings While You Were Clocked Out`)
        .setColor(0x00aaff)
        .setDescription(`You were pinged **${pings.length}** time(s) while clocked out.`)
        .setTimestamp();

      for (const ping of pings.slice(0, 5)) {
        embed.addFields({
          name: `By: ${ping.by} at <t:${ping.time}:R>`,
          value: `[Jump to Message](${ping.link})\n> ${ping.content || "_No message content_"}`
        });
      }

      if (pings.length > 5) {
        embed.addFields({
          name: `And ${pings.length - 5} more…`,
          value: "_Only the first 5 shown here._"
        });
      }

      await message.channel.send({ embeds: [embed] });
    }

    return;
  }

  if (message.content === ",checkout") {
    if (!hasStaffRole) return message.reply("❌ You don't have permission to use this command.");
    if (checkoutMap.has(message.author.id)) return message.reply("❌ You are already checked out.");

    checkoutMap.set(message.author.id, Math.floor(Date.now() / 1000));
    return message.channel.send(`🕒 **${message.author.username}** has checked out. Have a good day or night!`);
  }

  // Ping detection for clocked out users
  for (const mention of message.mentions.users.values()) {
    if (mention.bot) continue;
    if (checkoutMap.has(mention.id)) {
      const since = checkoutMap.get(mention.id);
      await message.channel.send({
        content: `🔔 <@${mention.id}> has clocked out since <t:${since}:R>.`
      });

      // Save the ping info
      const log = pingLog.get(mention.id) || [];
      log.push({
        by: `${message.author.tag}`,
        content: message.content,
        link: `https://discord.com/channels/${message.guild.id}/${message.channel.id}/${message.id}`,
        time: Math.floor(Date.now() / 1000)
      });
      pingLog.set(mention.id, log);
    }
  }
});

client.login(token);
