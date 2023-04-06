handleInput = function (msg) {
    if (msg.type !== "api" || msg.content !== "!get-ids") {
        return;
    }
    let ids = _.pluck(msg.selected, "_id");
    sendChat("GetIds", ids.join(", "));
};

on("chat:message", handleInput);
