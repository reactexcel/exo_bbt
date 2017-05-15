require('fs').list(__dirname).forEach(file => {
    require("./" + file);
});