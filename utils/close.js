const discordTranscripts = require('discord-html-transcripts');
const axios = require('axios');

module.exports = {
  async close(interaction, client, reason) {
    const ticket = await client.db.get(`tickets_${interaction.channel.id}`);
    if (!ticket) return interaction.reply({content: 'Ticket not found', ephemeral: true});

    if (client.config.whoCanCloseTicket === 'STAFFONLY' && !interaction.member.roles.cache.some(r => client.config.rolesWhoHaveAccessToTheTickets.includes(r.id))) return interaction.reply({
      content: client.locales.ticketOnlyClosableByStaff,
      ephemeral: true
    });

    if (ticket.closed) return interaction.reply({
      content: client.locales.ticketAlreadyClosed,
      ephemeral: true
    });

    await client.db.set(`tickets_${interaction.channel.id}.closed`, true);
    await client.db.set(`tickets_${interaction.channel.id}.closedBy`, interaction.user.id);
    await client.db.set(`tickets_${interaction.channel.id}.closedAt`, Date.now());

    if (reason) {
      await client.db.set(`tickets_${interaction.channel.id}.closeReason`, reason);
    } else {
      await client.db.set(`tickets_${interaction.channel.id}.closeReason`, client.locales.noReasonGiven);
    }

    const creator = await client.db.get(`tickets_${interaction.channel.id}.creator`);
    const invited = await client.db.get(`tickets_${interaction.channel.id}.invited`);

    interaction.channel.permissionOverwrites.edit(creator, {
      ViewChannel: false,
    });

    invited.forEach(async user => {
      interaction.channel.permissionOverwrites.edit(user, {
        ViewChannel: false,
      });
    });

    interaction.reply({
      content: client.locales.ticketCreatingTranscript,
    });

    await interaction.channel.messages.fetch()
    const messageId = await client.db.get(`tickets_${interaction.channel.id}.messageId`)
    const msg = interaction.channel.messages.cache.get(messageId);
    const embed = msg.embeds[0].data;

    msg.components[0].components.map(x => {
      if (x.data.custom_id === 'close') x.data.disabled = true;
      if (x.data.custom_id === 'close_askReason') x.data.disabled = true;
    });

    msg.edit({
      content: msg.content,
      embeds: [embed],
      components: msg.components
    });

    let attachment = await discordTranscripts.createTranscript(interaction.channel, {
      returnType: 'buffer',
      fileName: 'transcript.html',
      minify: true,
      saveImages: true,
      useCDN: true
    });

    async function close(res) {
      interaction.channel.send({
        content: client.locales.ticketTranscriptCreated.replace('TRANSCRIPTURL', `https://transcript.cf/${res.data.id}`),
      });
      await client.db.set(`tickets_${interaction.channel.id}.transcripturl`, `https://transcript.cf/${res.data.id}`);
      const ticket = await client.db.get(`tickets_${interaction.channel.id}`);

      const row = new client.discord.ActionRowBuilder()
			.addComponents(
				new client.discord.ButtonBuilder()
					.setCustomId('deleteTicket')
					.setLabel(client.locales.other.deleteTicketButtonMSG)
					.setStyle(client.discord.ButtonStyle.Danger),
			);

      interaction.channel.send({
        embeds: [JSON.parse(JSON.stringify(client.embeds.ticketClosed)
          .replace('TICKETCOUNT', ticket.id)
          .replace('REASON', ticket.closeReason)
          .replace('CLOSERNAME', interaction.user.tag))],
        components: [row]
      });

      const tiketClosedDMEmbed = new client.discord.EmbedBuilder()
      .setColor(client.embeds.ticketClosedDM.color ? client.embeds.ticketClosedDM.color : client.config.mainColor)
      .setDescription(
        client.embeds.ticketClosedDM.description
        .replace('TICKETCOUNT', ticket.id)
        .replace('TRANSCRIPTURL', `https://transcript.cf/${res.data.id}`)
        .replace('REASON', ticket.closeReason)
        .replace('CLOSERNAME', interaction.user.tag)
      )
      .setFooter({
        text: "is.gd/ticketbot" + client.embeds.ticketClosedDM.footer.text.replace("is.gd/ticketbot", ""), // Please respect the LICENSE :D
        iconUrl: client.embeds.ticketClosedDM.footer.iconUrl
      })

      client.users.fetch(creator).then(user => {
        user.send({
          embeds: [tiketClosedDMEmbed]
        });
      });
    };

    if (Buffer.byteLength(attachment) > 19000000) {
      attachment = await discordTranscripts.createTranscript(interaction.channel, {
        returnType: 'buffer',
        fileName: 'transcript.html',
        minify: true,
        saveImages: false,
        useCDN: true
      });

      axios.post('http://127.0.0.1:3000/upload', {buffer: attachment}).then(res => {
        close(res);
      })
    } else {
      axios.post('http://127.0.0.1:3000/upload', {buffer: attachment}).then(res => {
        close(res);
      })
    };
  }
};