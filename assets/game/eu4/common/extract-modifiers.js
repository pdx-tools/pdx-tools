// With chrome, open: https://eu4.paradoxwikis.com/Modifier_list
// Paste the below into the console.
// Run it.
// Save the output
var modifierTables = document.querySelectorAll("table.jquery-tablesorter");
var data = [];
for (var i = 0; i < modifierTables.length; i++) {
    var table = modifierTables[i];
    if (table.rows[0].cells.length !== 5) {
        continue;
    }

    for (var j = 1; j < table.rows.length; j++) {
        var row = table.rows[j];
        data.push([row.cells[0].innerText, row.cells[3].innerText]);
    }
}

data.sort(([a, _a], [b, _b]) => a.localeCompare(b));
for (var i = 0; i < data.length; i++) {
    console.log(`${data[i][0]} ${data[i][1]}`);
}