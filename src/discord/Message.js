import { bind, noop } from "../misc.js";

import Discord, { Message } from "discord.js";

/**
 * Reacts with an emote that shows that the message was understood
 * @param {Discord.GuildMember} member
 */
Message.prototype.acknowledge = function(member) {
    this.react((this.channel.race?.game ?? member.guild).config.emotes.acknowledge);
};

/** Crosses out the message */
Message.prototype.crossOut = function() {
    this.edit(`~~${this}~~`).catch(noop);
};

/**
 * Split long reply over multiple messages
 * @param {(error) => void} onError
 * @param {string} firstHeading
 * @param {string} otherHeading
 * @param {() => Generator<string, void, unknown> | Promise<Generator<string, void, unknown>>} messageGenerator
 */
Message.prototype.multiReply = async function(onError, firstHeading, otherHeading, messageGenerator) {
    const messages = [];
    let messageString = firstHeading;

    function forEach(toAdd) {
        if (messageString.length + toAdd.length > 2000) {
            messages.push(messageString);
            messageString = otherHeading;
        }

        messageString += toAdd;
    }

    try {
        if (messageGenerator.constructor.name.startsWith("Async")) {
            for await (let toAdd of messageGenerator()) {
                forEach(toAdd);
            }
        } else {
            for (let toAdd of messageGenerator()) {
                forEach(toAdd);
            }
        }
    } catch (e) {
        onError(e);
        return;
    }

    messages.push(messageString);
    this.inlineReply(messages.shift());
    let index = 0;
    for (let messageToSend of messages) {
        setTimeout(() => {
            this.channel.send(messageToSend);
        }, index * 100);
        index++;
    }
};

// https://gist.github.com/Allvaa/0320f06ee793dc88e4e209d3ea9f6256
// this is already in #master (https://github.com/discordjs/discord.js/pull/4874)
// but not in #stable, it'll be merged in version 13
Message.prototype.inlineReply = async function(content, options) {
    if (this.channel.type === "dm") {
        this.channel.send(...arguments);
        return;
    }

    const mentionRepliedUser = (options ?? content)?.allowedMentions?.repliedUser ? (options ?? content).allowedMentions.repliedUser : true;
    delete ((options ?? content)?.allowedMentions ?? {}).repliedUser;

    const apiMessage = (content instanceof Discord.APIMessage) ? content.resolveData() : Discord.APIMessage.create(this.channel, content, options).resolveData();
    Object.assign(apiMessage.data, { message_reference: { message_id: this.id } });

    if (!apiMessage.data.allowed_mentions || Object.keys(apiMessage.data.allowed_mentions).length === 0) {
        apiMessage.data.allowed_mentions = { parse: ["users", "roles", "everyone"] };
    }

    if (!apiMessage.data.allowed_mentions.replied_user) {
        Object.assign(apiMessage.data.allowed_mentions, { replied_user: mentionRepliedUser });
    }

    if (Array.isArray(apiMessage.data.content)) {
        return Promise.all(apiMessage.split().map((x) => {
            x.data.allowed_mentions = apiMessage.data.allowed_mentions;
            return x;
        }).map(bind(this, "inlineReply")));
    }

    const { data, files } = await apiMessage.resolveFiles();
    return this.client.api.channels[this.channel.id].messages
        .post({ data, files })
        .then((d) => this.client.actions.MessageCreate.handle(d).message);
};
