export async function handleCommand(client, message) {
  try {
    const content = message.content?.trim();
    const prefix = client.prefix;

    if (!content?.startsWith(prefix)) return;

    const args = content.slice(prefix.length).split(/\s+/);
    const commandName = args.shift().toLowerCase();

    const command =
      client.commands.get(`${prefix}${commandName}`) ||
      client.commands.get(commandName);

    if (!command) return;

    const reply = async (text) => {
      if (!text) return;
      await client.sendMessage(message.channel_id, text);
    };

    const embed = async ({ title, description }) => {
      await client.sendMessage(message.channel_id, {
        embeds: [
          {
            title,
            description,
            color: 0x5865f2, // Discord blurple
          },
        ],
      });
    };

    await command({
      message,
      args,
      reply,
      embed,
      client,
    });
  } catch (err) {
    console.error("[Jscord] Command handler error:", err);
  }
}
