exports.total = (lines) => lines.reduce((s, l) => s + l.price, 0);
