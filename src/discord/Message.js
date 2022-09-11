import { noop } from "../misc.js";

import { ChannelType, Message } from "discord.js";

/** Reacts with an emote that shows that the message was understood */
Message.prototype.acknowledge = function (member) {
	return this.react((this.channel.race?.game ?? member.guild).config.emotes.acknowledge);
};

/** Crosses out the message */
Message.prototype.crossOut = function () {
	return this.edit(`~~${this}~~`).catch(noop);
};

/** Split long reply over multiple messages */
Message.prototype.multiReply = async function (onError, firstHeading, otherHeading, messageGenerator) {
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
		index += 1;
	}
};

Message.prototype.inlineReply = function () {
	if (this.channel.type === ChannelType.DM) {
		return this.channel.send(...arguments);
	}

	return this.reply(...arguments);
};
