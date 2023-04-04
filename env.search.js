/* 2.0.0 ищет данне для переменных среды

cscript env.search.min.js [location] [<config>...] [\\ <filter>...] [\\ <input>...] [\\ <action>...]

<location>  - Путь к файлу, папке или url к источнику данных.
    file    - Получение данных из папки с ini файлами или из tsv, csv файла.
    ldap    - Получение данных из active directory (guid, cn, dn или пустое значение).
<config>    - Конфигурационные параметры (может быть несколько, порядок не важен).
    search  - Поисковой запрос (можно опустить, будет запрошен в процессе).
    index   - Номер объекта в выборке (можно опустить, будет запрошен в процессе).
    action  - Ключ действия (можно опустить, будет запрошен в процессе).
    item    - Шаблон представления объектов в выборке (доступны переменные).
    unit    - Шаблон представления других списков (доступны переменные).
    service - Имя удалённой службы, которую нужно запустить перед выполнением действия.
    check   - Флаг проверки доступности целевых компьютеров.
    user    - Флаг запроса информации по пользователю (только для url схемы ldap).
    noalign - Флаг запрета выравнивания выборок и списков.
    nowait  - Флаг выполнения действия без ожидания (только при отсутствии service).
    color   - Флаг использования цветового оформления.
    repeat  - Флаг повторения действия.
<filter>    - Фильтры по свойствам объекта (доступны wildcard шаблоны и объединения ключей).
<input>     - Шаблоны для получения данных из свойств объекта (только для url схемы ldap).
<action>    - Действия в формате ключ и команда или разделители (доступны переменные).

*/

var search = new App({
    dosCharset: "cp866",                                // кодировка для dos
    winCharset: "windows-1251",                         // кодировка для windows
    hideValue: "***",                                   // отображение для скрытого значения
    hideEnd: "-HIDE",                                   // окончание названия для скрытия значения
    argWrap: '"',                                       // основное обрамление аргументов
    altWrap: "'",                                       // альтернативное обрамление аргументов
    envWrap: "%",                                       // основное обрамление переменных
    spсDelim: " ",                                      // пробельный разделитель
    argDelim: ",",                                      // разделитель названий в ключе аргумента
    keyDelim: "=",                                      // разделитель ключа от значения
    csvDelim: ";",                                      // разделитель значений для файла выгрузки csv
    tsvDelim: "\t",                                     // разделитель значений для файла выгрузки tsv
    putDelim: "\\\\",                                   // разделитель потоков параметров
    envType: "Process"                                  // тип изменяемого переменного окружения
});

// подключаем зависимые свойства приложения
(function (wsh, app, undefined) {
    app.lib.extend(app, {
        fun: {// зависимые функции частного назначения

            /**
             * Транслитирируем русские символы в английские.
             * @param {string} input - Строка для преобразования.
             * @returns {string} Преобразованная строка.
             */

            translit: function (input) {
                var rule, flag, output = "";

                rule = {// правила транслитерации
                    // приорететные
                    "щ": "shch", "ё": "yo", "ж": "zh", "ч": "ch", "ш": "sh", "ю": "yu", "я": "ya", "х": "kh",
                    // обычные
                    "а": "a", "б": "b", "в": "v", "г": "g", "д": "d", "е": "e", "з": "z", "и": "i", "й": "j",
                    "к": "k", "л": "l", "м": "m", "н": "n", "о": "o", "п": "p", "р": "r", "с": "s", "т": "t",
                    "у": "u", "ф": "f", "ц": "c", "ы": "y", "э": "e",
                    // последнии
                    "ъ": "", "ь": ""
                };

                input = input || "";// по умолчанию
                for (var i = 0, iLen = input.length; i < iLen; i++) {
                    // выполняем поиск совподения с правилом
                    flag = false;// найдено ли совпадение
                    for (var key in rule) {// пробигаемся по правилу
                        value = input.substring(i, i + key.length);
                        flag = value.toLowerCase() == key;
                        if (flag) break;
                    };
                    // форматируем регистр
                    if (flag) {// если найдено совпадение
                        flag = value == value.toLowerCase();
                        if (!flag) {// если не всё в нижнем регистре
                            value = input.substring(i + key.length, i + key.length + 1);
                            flag = value == value.toUpperCase();
                            if (!flag) {// если далее идёт нижний регистр
                                value = rule[key].substring(0, 1).toUpperCase() + rule[key].substring(1);
                            } else value = rule[key].toUpperCase();
                        } else value = rule[key];
                        // добовляем смещение
                        i += key.length - 1;
                    } else value = input.substring(i, i + 1);
                    // формируем резултат
                    output += value;
                };
                // возвращаем результат
                return output;
            },

            /**
             * Добавляет управляющую последовательность к тексту.
             * @param {string} type - Тип управляющей последовательности.
             * @param {string} option - Опция для типа управляющий последовательности.
             * @param {string} [text] - Текст к которому добавляется последовательность.
             * @param {boolean} [reset] - Добавить сбрасывающую последовательность в конце.
             * @returns {string} Текст с добавленной последовательностью.
             */

            escape: function (type, option, text, reset) {
                var prefix, code, suffix, undo;

                text = text ? "" + text : "";
                prefix = String.fromCharCode(27);
                // формируем последовательность
                switch (type) {// поддерживаемые типы
                    case "color":// цвет шрифта
                        prefix += "["; suffix = "m";
                        undo = prefix + "0" + suffix;
                        switch (option) {// поддерживаемые цвета
                            case "black": code = "90"; break;
                            case "red": code = "91"; break;
                            case "green": code = "92"; break;
                            case "yellow": code = "93"; break;
                            case "blue": code = "94"; break;
                            case "purple": code = "95"; break;
                            case "cyan": code = "96"; break;
                            case "white": code = "97"; break;
                            case "default": code = "0"; break;
                        };
                        break;
                    case "cursor":// положение курсора
                        prefix += "["; code = "1";
                        undo = prefix + "2K";
                        switch (option) {// поддерживаемые цвета
                            case "up": suffix = "A"; break;
                            case "down": suffix = "B"; break;
                            case "forward": suffix = "C"; break;
                            case "backward": suffix = "D"; break;
                        };
                        break;
                };
                // оборачиваем текст
                if (code && suffix) {// если получены все данные
                    text = prefix + code + suffix + text;
                    if (reset) text += undo;
                };
                // возвращаем результат
                return text;
            },

            /**
             * Получает значение свойства ADSI объекта.
             * @param {ADSI} item - ADSI объект для получения данных.
             * @param {string} attribute - Свойство ADSI объекта с данными.
             * @returns {string} Значение свойства ADSI объекта.
             */

            getItemAttribute: function (item, attribute) {
                var value = "";

                try {// пробуем получить данные
                    value = item.get(attribute);
                } catch (e) { };// игнорируем исключения
                // возвращаем результат
                return value;
            },

            /**
             * Получаем данные по простому шаблону.
             * @param {string} pattern - Шаблон для получения данных.
             * @param {string} value - Строка для извлечения данных.
             * @param {boolean} [strict] - Учитывать регистр букв для ключей.
             * @returns {object} Объект с полученными данными.
             */

            getDataPattern: function (pattern, value, strict) {
                var fragments, index, fragment, name, isSkip, isName,
                    offset = 0, data = {}, error = 0;

                value = value ? "" + value : "";
                pattern = pattern ? "" + pattern : "";
                fragments = pattern.split(app.val.envWrap);
                for (var i = 0, j = 0, iLen = fragments.length; i < iLen && !error; i++) {
                    fragment = fragments[i];// получаем фрагмент
                    isName = ((i + j) % 2 && i != iLen - 1);
                    isSkip = isName && ~fragment.indexOf(app.val.spсDelim);
                    if (isName && !isSkip) {// если это имя
                        name = strict ? fragment : fragment.toUpperCase();
                        if (name) {// если ключ задан
                            fragment = fragments[i + 1];// получаем фрагмент
                            if (!fragment.length) index = value.length;
                            else index = value.indexOf(fragment, offset);
                            if (~index) {// если найдено совпадение
                                data[name] = value.substring(offset, index);
                                offset = index;
                            } else error = 3;
                        } else error = 2;
                    } else {// если это не имя
                        if (isSkip) offset += app.val.envWrap.length;
                        index = value.indexOf(fragment, offset);
                        if (offset == index) {// если найдено совпадение
                            offset += fragment.length;
                        } else error = 1;
                        if (isSkip) j++;
                    };
                };
                // возвращаем результат
                return !error ? data : {};
            },

            /**
             * Заполняет простой шаблон данными.
             * @param {string} pattern - Шаблон для заполнения данными.
             * @param {object} [data] - Данные для заполнения шаблона.
             * @param {boolean} [strict] - Учитывать регистр букв для ключей.
             * @param {boolean} [clear] - Удалять шаблоны для не известных ключей.
             * @returns {string} Заполненный шаблон с данными.
             */

            setDataPattern: function (pattern, data, strict, clear) {
                var fragments, fragment, value, isChange, isSkip, isName;

                data = data || {};// по умолчанию
                pattern = pattern ? "" + pattern : "";
                fragments = pattern.split(app.val.envWrap);
                for (var i = 0, j = 0, iLen = fragments.length; i < iLen; i++) {
                    fragment = fragments[i];// получаем фрагмент
                    isName = ((i + j) % 2 && i != iLen - 1);
                    isSkip = isName && ~fragment.indexOf(app.val.spсDelim);
                    if (isName && !isSkip) {// если это имя
                        isChange = false;// изменён ли фрагмент на данные
                        for (var name in data) {// пробигаемся по данным
                            if (!app.lib.compare(name, fragment, !strict)) {
                                fragment = data[name];
                                fragments[i] = fragment;
                                isChange = true;
                            };
                        };
                        if (!isChange) {// если изменения не было
                            if (clear) fragment = "";// сбрасываем значение
                            else fragment = app.val.envWrap + fragment + app.val.envWrap;
                            fragments[i] = fragment;
                        };
                    } else if (isSkip) {// если нужно пропустить
                        fragment = app.val.envWrap + fragment;
                        fragments[i] = fragment;
                        j++;
                    };
                };
                value = fragments.join("");
                // возвращаем результат
                return value;
            },

            /**
             * Очищает шаблон от разделителей.
             * @param {string} pattern - Шаблон для очистки.
             * @returns {string} Очищенный шаблон.
             */

            clearDelimPattern: function (pattern) {
                var fragments, fragment, value, isSkip, isName;

                pattern = pattern ? "" + pattern : "";
                fragments = pattern.split(app.val.envWrap);
                for (var i = 0, j = 0, iLen = fragments.length; i < iLen; i++) {
                    fragment = fragments[i];// получаем фрагмент
                    isName = ((i + j) % 2 && i != iLen - 1);
                    isSkip = isName && ~fragment.indexOf(app.val.spсDelim);
                    if (isName && !isSkip) {// если это имя
                    } else {// если это не ключ
                        fragment = fragments[i];// получаем фрагмент
                        fragment = app.lib.strPad("", fragment.length, app.val.spсDelim, "left");
                        fragments[i] = fragment;
                        if (isSkip) j++;
                    };
                };
                value = fragments.join(app.val.envWrap);
                // возвращаем результат
                return value;
            },

            /**
             * Преобразует значение для индексного параметра в число.
             * @param {string} value - Значение для преобразования.
             * @returns {array} Массив с преобразованным значением.
             */

            convIndexParam: function (value) {

                if (isNaN(value)) value = 0;
                else value = Number(value);
                // возвращаем результат
                return [value - 1];
            },

            /**
             * Преобразует значение и название для параметра действия.
             * @param {string} value - Значение для преобразования.
             * @param {string} name - Название для преобразования.
             * @returns {array} Массив с преобразованным значением и названием.
             */

            convActionParam: function (value, name) {
                return name ? [value, name] : [name, value];
            },

            /**
             * Преобразует значение для адресного параметра.
             * @param {string} value - Значение для преобразования.
             * @returns {array} Массив с преобразованным значением.
             */

            convLocationParam: function (value) {
                var location = app.lib.url2obj(value);

                location.nix = app.lib.nix2win(location.path, null, true);
                location.win = app.lib.nix2win(location.path, location.domain, false);
                if (!location.scheme) location.scheme = "file";
                // возвращаем результат
                return [location];
            },

            /**
             * Преобразует убирая название у пустого значения.
             * @param {string} value - Значение для преобразования.
             * @param {string} name - Название для преобразования.
             * @returns {array} Массив с преобразованным значением.
             */

            convNoEmptyParam: function (value, name) {
                return value ? [value, name] : [value, null];
            }
        },
        init: function () {// функция инициализации приложения
            var key, value, dn, wildcard, query, container, fso, shell, isDelim, isFound, isMatch, file, params, map, data,
                i, iLen, j, jLen, files, units, locator, local, remote, response, users, count, delim, wrap, isNeedInput,
                end, cache, name, names, service, command, fragments, fragment, item, items = [], isFirstLine = true,
                config = { item: "%NET-HOST%", unit: "%TMP-KEY%", location: {} }, filter = {}, input = {}, action = {},
                error = 0;

            shell = new ActiveXObject("WScript.Shell");
            fso = new ActiveXObject("Scripting.FileSystemObject");
            locator = new ActiveXObject("wbemScripting.Swbemlocator");
            locator.security_.impersonationLevel = 3;// Impersonate
            params = app.wsh.arg2arr(wsh.arguments);// переданные аргументы
            delim = app.val.keyDelim; wrap = app.val.argWrap; end = app.val.putDelim;
            // получаем конфигурационные параметры
            if (!error) {// если нет ошибок
                app.lib.setParamKeys(config, null, ["check", "user", "color", "repeat"], false, params, delim, wrap, end);
                app.lib.setParamKeys(config, null, ["noalign", "nowait"], false, params, delim, wrap, end);
                app.lib.setParamKeys(config, "location", app.fun.convLocationParam, false, params, delim, wrap, end);
                app.lib.setParamKeys(config, ["index"], app.fun.convIndexParam, false, params, delim, wrap, end);
                app.lib.setParamKeys(config, ["search", "action", "service"], null, false, params, delim, wrap, end);
                app.lib.setParamKeys(config, ["item", "unit"], null, false, params, delim, wrap, end);
                if (!error && params.length && params.shift() != end) error = 1;
            };
            // получаем фильтрующие параметры
            if (!error && app.lib.hasValue(config.location)) {// если нужно выполнить
                app.lib.setParamKeys(filter, [null], null, false, params, delim, wrap, end);
                if (!error && params.length && params.shift() != end) error = 2;
            };
            // получаем входящие параметры
            if (!error && app.lib.hasValue(config.location) && app.lib.hasValue(params, end)) {// если нужно выполнить
                app.lib.setParamKeys(input, [null], app.fun.convNoEmptyParam, false, params, delim, wrap, end);
                if (!error && params.length && params.shift() != end) error = 3;
            };
            // получаем параметры действий
            if (!error) {// если нет ошибок
                end = null;// последняя секция
                app.lib.setParamKeys(action, [null], app.fun.convActionParam, false, params, delim, wrap, end);
                if (!error && params.length && params.shift() != end) error = 4;
            };
            // получаем поисковой запрос от пользователя
            if (!error && app.lib.hasValue(config.location)) {// если нужно выполнить
                isNeedInput = !("search" in config);
                if (isNeedInput) {// если требуется ввод
                    try {// пробуем получить данные
                        wsh.stdOut.write("Введите поисковой запрос: ");
                        if (config.color) wsh.stdOut.write(app.fun.escape("color", "yellow"));
                        value = wsh.stdIn.readLine();// просим ввести строку
                        if (config.color) wsh.stdOut.write(app.fun.escape("color", "default"));
                        value = app.wsh.iconv(app.val.dosCharset, app.val.winCharset, value);
                        config.search = value;
                        isFirstLine = false;
                    } catch (e) {// если возникли ошибки
                        try {// пробуем выполнить
                            wsh.stdOut.writeLine();// выводим пустую строчку
                        } catch (e) { };// игнорируем исключения
                        error = 5;
                    };
                };
            };
            // выполняем транслит поискового запроса
            if (!error) {// если нужно выполнить
                config.translit = config.search ? app.fun.translit(config.search) : "";
            };
            // выполняем поиск в указанном режиме
            switch (true) {// поддерживаемые режимы
                case "file" == config.location.scheme && fso.fileExists(config.location.win):// файл
                    // проверяем обязательные параметры
                    if (!error) {// если нет ошибок
                        if (// множественное условие
                            (config.unit || !app.lib.hasValue(action)) && config.item
                        ) {// если проверка пройдена
                        } else error = 7;
                    };
                    // проверяем запрещённые параметры
                    if (!error) {// если нет ошибок
                        if (// множественное условие
                            (!config.nowait || !config.service)
                            && (!config.repeat || ("action" in config ? !config.nowait : config.color))
                            && !config.location.user && !config.location.password
                            && !app.lib.hasValue(input)
                            && !config.user
                        ) {// если проверка пройдена
                        } else error = 8;
                    };
                    // получаем контейнер
                    if (!error) {// если нет ошибок
                        container = fso.getFile(config.location.win);
                    };
                    // получаем данные из контейнер
                    if (!error) {// если нет ошибок
                        value = app.wsh.getFileText(container.path);
                        switch (false) {// поддерживаемые разделители
                            case !app.lib.hasValue(value, app.val.tsvDelim, true): delim = app.val.tsvDelim; break;
                            case !app.lib.hasValue(value, app.val.csvDelim, true): delim = app.val.csvDelim; break;
                            default: delim = "";// не определённый разделитель
                        };
                        units = delim ? app.lib.tsv2arr(value, true, delim, false, true) : [];
                    };
                    // формируем кеш для ускорения поиска
                    if (!error) {// если нет ошибок
                        j = 0;// начальное значение
                        cache = [];// сбрасываем значение
                        for (var key in filter) {// уровень AND
                            cache[j] = [];// задаём значение
                            names = key.split(app.val.argDelim);
                            value = filter[key];// получаем значение
                            data = { "search": config.search, "translit": config.translit };
                            value = app.fun.setDataPattern(value, data, false, true);
                            for (var k = 0, kLen = names.length; k < kLen; k++) {// уровень OR
                                name = names[k];// получаем очередное название
                                wildcard = value;// получаем очередное значение
                                item = { "name": name, "wildcard": wildcard };
                                cache[j][k] = item;
                            };
                            j++;
                        };
                    };
                    // выполняем поиск целевых объектов
                    if (!error) {// если нет ошибок
                        for (var i = 0, iLen = units.length; i < iLen; i++) {
                            data = units[i];// получаем очередной объект
                            // проверяем значение параметров объекта
                            isFound = data;// начальное значение
                            for (var j = 0, jLen = cache.length; j < jLen && isFound; j++) {
                                isMatch = false;// начальное значение
                                for (var k = 0, kLen = cache[j].length; k < kLen && !isMatch; k++) {
                                    item = cache[j][k];// получаем очередной элимент
                                    value = data[item.name];// получаем очередное значение
                                    isMatch = app.lib.match(value, item.wildcard);
                                };
                                isFound = isMatch;
                            };
                            // добавляем объект в список
                            if (isFound) items.push(data);
                        };
                    };
                    break;
                case "file" == config.location.scheme && fso.folderExists(config.location.win):// папка
                    // проверяем обязательные параметры
                    if (!error) {// если нет ошибок
                        if (// множественное условие
                            (config.unit || !app.lib.hasValue(action)) && config.item
                        ) {// если проверка пройдена
                        } else error = 7;
                    };
                    // проверяем запрещённые параметры
                    if (!error) {// если нет ошибок
                        if (// множественное условие
                            (!config.nowait || !config.service)
                            && (!config.repeat || ("action" in config ? !config.nowait : config.color))
                            && !config.location.user && !config.location.password
                            && !app.lib.hasValue(input)
                            && !config.user
                        ) {// если проверка пройдена
                        } else error = 8;
                    };
                    // получаем контейнер
                    if (!error) {// если нет ошибок
                        container = fso.getFolder(config.location.win);
                    };
                    // формируем кеш для ускорения поиска
                    if (!error) {// если нет ошибок
                        j = 0;// начальное значение
                        cache = [];// сбрасываем значение
                        for (var key in filter) {// уровень AND
                            cache[j] = [];// задаём значение
                            names = key.split(app.val.argDelim);
                            value = filter[key];// получаем значение
                            data = { "search": config.search, "translit": config.translit };
                            value = app.fun.setDataPattern(value, data, false, true);
                            for (var k = 0, kLen = names.length; k < kLen; k++) {// уровень OR
                                name = names[k];// получаем очередное название
                                wildcard = value;// получаем очередное значение
                                item = { "name": name, "wildcard": wildcard };
                                cache[j][k] = item;
                            };
                            j++;
                        };
                    };
                    // выполняем поиск целевых объектов
                    if (!error) {// если нет ошибок
                        files = new Enumerator(container.files);
                        while (!files.atEnd()) {// пока не достигнут конец
                            file = files.item();// получаем очередной элемент коллекции
                            files.moveNext();// переходим к следующему элементу
                            value = app.wsh.getFileText(file.path);
                            switch (false) {// поддерживаемые разделители
                                case !app.lib.hasValue(value, app.val.keyDelim, true): delim = app.val.keyDelim; break;
                                default: delim = "";// не определённый разделитель
                            };
                            data = delim ? app.lib.ini2obj(value, false) : null;
                            // проверяем значение параметров объекта
                            isFound = data;// начальное значение
                            for (var j = 0, jLen = cache.length; j < jLen && isFound; j++) {
                                isMatch = false;// начальное значение
                                for (var k = 0, kLen = cache[j].length; k < kLen && !isMatch; k++) {
                                    item = cache[j][k];// получаем очередной элимент
                                    value = data[item.name];// получаем очередное значение
                                    isMatch = app.lib.match(value, item.wildcard);
                                };
                                isFound = isMatch;
                            };
                            // добавляем объект в список
                            if (isFound) items.push(data);
                        };
                    };
                    break;
                case "ldap" == config.location.scheme:// домен
                    // проверяем обязательные параметры
                    if (!error) {// если нет ошибок
                        if (// множественное условие
                            (config.unit || !app.lib.hasValue(action)) && config.item
                        ) {// если проверка пройдена
                        } else error = 7;
                    };
                    // проверяем запрещённые параметры
                    if (!error) {// если нет ошибок
                        if (// множественное условие
                            (!config.nowait || !config.service)
                            && (!config.repeat || ("action" in config ? !config.nowait : config.color))
                            && !(config.location.nix && config.location.domain)
                            && !config.location.user && !config.location.password
                        ) {// если проверка пройдена
                            if (!config.location.nix) config.location.nix = config.location.domain;
                        } else error = 8;
                    };
                    // получаем контейнер
                    if (!error) {// если нет ошибок
                        container = app.wsh.ldap(config.location.nix)[0];
                        if (container) {// если контейнер существует
                        } else error = 9;
                    };
                    // формируем кеш для ускорения поиска
                    if (!error) {// если нет ошибок
                        j = 0;// начальное значение
                        cache = [];// сбрасываем значение
                        map = {};// мепинг значений и distinguished name
                        for (var key in filter) {// пробигаемся по фильтрам
                            cache[j] = [];// задаём значение
                            names = key.split(app.val.argDelim);
                            value = filter[key];// получаем значение
                            data = { "search": config.search, "translit": config.translit };
                            value = app.fun.setDataPattern(value, data, false, true);
                            for (var k = 0, kLen = names.length; k < kLen; k++) {
                                name = names[k];// получаем очередное название
                                query = app.lib.wcd2wql(value, name, function (value, name) {
                                    if (value && app.lib.hasValue(["manager", "managedBy", "member", "memberOf"], name, false)) {
                                        if (!(value in map)) {// если поиск идентификатора ещё не выполнялся
                                            item = app.wsh.ldap(value, container)[0];
                                            dn = item ? app.fun.getItemAttribute(item, "distinguishedName") : null;
                                            map[value] = dn;// сохраняем идентификатор что бы не искать в дальнейшем
                                        };
                                        value = map[value];
                                    };
                                    return value ? [value] : [];
                                });
                                item = { "query": query };
                                cache[j][k] = item;
                            };
                            j++;
                        };
                    };
                    // выполняем поиск целевых объектов
                    if (!error) {// если нет ошибок
                        fragments = [];// сбрасываем значение
                        for (var j = 0, jLen = cache.length; j < jLen; j++) {
                            fragments[j] = [];// сбрасываем значение
                            for (var k = 0, kLen = cache[j].length; k < kLen && !isMatch; k++) {
                                item = cache[j][k];// получаем очередной элимент
                                fragment = item.query;
                                fragments[j][k] = fragment;
                            };
                            fragment = fragments[j].join(" OR ");
                            if (kLen > 1) fragment = "(" + fragment + ")";
                            fragments[j] = fragment;
                        };
                        fragment = fragments.join(" AND ");
                        units = app.wsh.ldap(
                            fragment ? "WHERE " + fragment : "",
                            container
                        );
                    };
                    // выполняем получение данных по целевым объектам
                    if (!error) {// если нет ошибок
                        length = units.length;// получаем длину
                        for (var i = 0, iLen = units.length; i < iLen; i++) {
                            item = units[i];// получаем очередной объект
                            data = {};// сбрасываем значение
                            // работаем с объектом
                            map = {// мепинг аттрибутов
                                cn: "NET-HOST"
                            };
                            for (var key in map) {// пробегаемся по мепингу аттрибутов
                                name = map[key];// получаем имя
                                if (value = app.fun.getItemAttribute(item, key)) data[name] = value;
                            };
                            for (var key in input) {// пробегаемся входящим параметрам
                                data = app.lib.extend(data, app.fun.getDataPattern(input[key], app.fun.getItemAttribute(item, key), false));
                                name = "SYS-VERSION"; if (value = data[name]) if (value = value.replace(" (", ".").replace(")", "")) data[name] = value;
                            };
                            // получаем данные о пользователе
                            if (config.user && data["USR-NAME-FIRST"] && data["USR-NAME-SECOND"]) {// если нужно дозапросить данные
                                users = app.wsh.ldap(
                                    "WHERE objectClass = 'User'" +
                                    " AND sn = '" + data["USR-NAME-FIRST"] + "'" +
                                    " AND givenName = '" + data["USR-NAME-SECOND"] + "'",
                                    container
                                );
                                if (users.length) {// если удалось получить данные
                                    item = users[0];// получаем очередной объект
                                    // работаем с пользователем
                                    map = {// мепинг аттрибутов
                                        co: "USR-COUNTRY",
                                        c: "USR-COUNTRY-ID",
                                        company: "USR-COMPANY",
                                        displayName: "USR-NAME",
                                        department: "USR-DEPARTMENT",
                                        homeDirectory: "USR-HOME",
                                        l: "USR-CITY",
                                        mail: "USR-EMAIL",
                                        mobile: "USR-MOBILE",
                                        objectSid: "USR-SID",
                                        sAMAccountName: "USR-LOGIN",
                                        distinguishedName: "USR-ACCOUNT-DN",
                                        telephoneNumber: "USR-PHONE",
                                        title: "USR-POSITION",
                                        info: "USR-INFO"
                                    };
                                    for (var key in map) {// пробегаемся по мепингу аттрибутов
                                        name = map[key];// получаем имя
                                        if (value = app.fun.getItemAttribute(item, key)) data[name] = value;
                                    };
                                };
                            };
                            // добавляем объект в список
                            items.push(data);
                        };
                    };
                    break;
                default:// не поддерживаемый режим
                    // обрабатываем не поддерживаемый режим
                    if (!error) {// если нет ошибок
                        if (!config.location.scheme) {// если не задан режим
                        } else error = 6;
                    };
                    // проверяем обязательные параметры
                    if (!error) {// если нет ошибок
                        if (// множественное условие
                            app.lib.hasValue(action, true) && config.unit
                        ) {// если проверка пройдена
                        } else error = 7;
                    };
                    // проверяем запрещённые параметры
                    if (!error) {// если нет ошибок
                        if (// множественное условие
                            !app.lib.hasValue(input)
                            && (!config.repeat || ("action" in config ? !config.nowait : config.color))
                            && !("search" in config)
                            && !("index" in config)
                            && !config.service
                            && !config.check
                            && !config.user
                        ) {// если проверка пройдена
                        } else error = 8;
                    };
            };
            // проверяем список целевых объектов
            if (!error && config.location.scheme) {// если нужно выполнить
                if (items.length) {// если список не пуст
                } else error = 10;
            };
            // работаем в зависимости от наличия целевых объектов
            if (items.length) {// если список целевых объектов не пуст
                // работаем с проверкой доступности
                if (config.check) {// если требуется проверка
                    // подключаемся к локальному хосту
                    if (!error) {// если нет ошибок
                        try {// пробуем подключиться к компьютеру используя флаг wbemConnectFlagUseMaxWait
                            local = locator.connectServer(".", "root\\CIMV2", null, null, null, null, 0x80);
                        } catch (e) {// если возникли ошибки
                            error = 11;
                        };
                    };
                    // проверяем на доступность целевые объекты
                    if (!error) {// если нет ошибок
                        for (var i = 0, iLen = items.length; i < iLen; i++) {
                            data = items[i];// получаем очередной объект
                            // выполняем запрос
                            response = local.execQuery(
                                "SELECT responseTime, statusCode" +
                                " FROM Win32_PingStatus" +
                                " WHERE address = '" + data["NET-HOST"] + "'" +
                                " AND timeout = 999"
                            );
                            // обрабатываем ответ
                            response = new Enumerator(response);
                            while (!response.atEnd()) {// пока не достигнут конец
                                item = response.item();// получаем очередной элемент коллекции
                                response.moveNext();// переходим к следующему элементу
                                // работаем с элементом
                                if (0 == item.statusCode) data["TMP-CHECK"] = item.responseTime + " мс";
                                // останавливаемся на первом
                                break;
                            };
                        };
                    };
                };
                // выполняем подсчёт значений
                if (!error) {// если нет ошибок
                    count = {};// сбрасываем значение
                    for (var i = 0, iLen = items.length; i < iLen; i++) {
                        data = items[i];// получаем очередной объект
                        name = "TMP-INDEX"; data[name] = app.lib.strPad(i + 1, ("" + iLen).length, "0", "left");
                        data = app.lib.clone(data);// колонируем для изменений
                        for (var name in data) if (name.substring(name.length - app.val.hideEnd.length).toUpperCase() === app.val.hideEnd) data[name] = app.val.hideValue;
                        if (!config.noalign) for (var name in data) count[name] = Math.max(data[name].length, count[name] || 0);
                    };
                };
                // выыодим список целевых объектов
                if (!error) {// если нет ошибок
                    if (!isFirstLine) wsh.stdOut.writeLine();// выводим пустую строчку
                    for (var i = 0, iLen = items.length; i < iLen; i++) {
                        data = items[i];// получаем очередной объект
                        data = app.lib.clone(data);// колонируем для изменений
                        for (var name in data) if (name.substring(name.length - app.val.hideEnd.length).toUpperCase() === app.val.hideEnd) data[name] = app.val.hideValue;
                        if (!config.noalign) for (var name in count) data[name] = app.lib.strPad(data[name] || "", count[name], app.val.spсDelim, isNaN(app.lib.trim(data[name]).charAt(0)) ? "right" : "left");
                        name = "TMP-INDEX"; if (value = data[name]) data[name] = app.fun.escape("color", config.color && "yellow", value, true);
                        name = "NET-HOST"; if (value = data[name]) data[name] = app.fun.escape("color", config.color && "cyan", value, true);
                        value = app.fun.setDataPattern(config.item, data, false, true);
                        wsh.stdOut.writeLine(value);
                    };
                    if (app.lib.hasValue(action, true)) wsh.stdOut.writeLine();// выводим пустую строчку
                    isFirstLine = true;
                };
            };
            // работаем в зависимости от наличия действий
            item = null;// сбрасываем информацию об целевом объекте
            if (app.lib.hasValue(action, true)) {// если список действий не пуст
                // работаем в зависимости от наличия целевых объектов
                if (items.length) {// если список целевых объектов не пуст
                    // получаем номер объекта от пользователя
                    if (!error) {// если нет ошибок
                        isNeedInput = !("index" in config);
                        if (isNeedInput) {// если требуется ввод
                            try {// пробуем получить данные
                                wsh.stdOut.write("Введите номер объекта: ");
                                if (config.color) wsh.stdOut.write(app.fun.escape("color", "yellow"));
                                value = wsh.stdIn.readLine();// просим ввести строку
                                if (config.color) wsh.stdOut.write(app.fun.escape("color", "default"));
                                value = app.wsh.iconv(app.val.dosCharset, app.val.winCharset, value);
                                value = app.fun.convIndexParam(value)[0];
                                config.index = value;
                                isFirstLine = false;
                            } catch (e) {// если возникли ошибки
                                try {// пробуем выполнить
                                    wsh.stdOut.writeLine();// выводим пустую строчку
                                } catch (e) { };// игнорируем исключения
                                error = 12;
                            };
                        };
                    };
                    // получаем целевой объект по порядковому номеру
                    if (!error) {// если нет ошибок
                        item = items[config.index];
                        if (item) {// если объект получен
                        } else error = 13;
                    };
                    // добавляем переменные во временное окружение
                    if (!error) {// если нет ошибок
                        data = item;// получаем данные
                        items = shell.environment(app.val.envType);
                        for (var name in data) {// пробигаемся по списку с данными
                            value = data[name];// получаем очередное значение
                            setEnv(items, name, value);
                        };
                    };
                };
                // выполняем подсчёт значений
                if (!error) {// если нет ошибок
                    units = [];// сбрасываем значение
                    count = {};// сбрасываем значение
                    i = 0; iLen = app.lib.hasValue(action, true);
                    for (var key in action) {// пробигаемся по действиям
                        value = action[key];// получаем очередное значение
                        isDelim = !value;// этот элимент является разделителем
                        // поправка для скрытых значений в команде
                        if (!isDelim) {// если это не разделитель
                            command = shell.expandEnvironmentStrings(value);
                            data = app.fun.getDataPattern(value, command, false);
                            for (var name in data) if (name.substring(name.length - app.val.hideEnd.length).toUpperCase() === app.val.hideEnd) data[name] = app.val.hideValue;
                            command = app.fun.setDataPattern(value, data, false, false);
                        };
                        // формируем данные
                        data = {};// сбрасываем значение
                        name = "TMP-KEY"; data[name] = key;
                        if (!isDelim) {// если это не разделитель
                            name = "TMP-VALUE"; data[name] = command;
                            name = "TMP-INDEX"; data[name] = app.lib.strPad(i + 1, ("" + iLen).length, "0", "left");
                            if (!config.noalign) for (var name in data) count[name] = Math.max(data[name].length, count[name] || 0);
                            i++;
                        };
                        units.push(data);
                    };
                };
                // выыодим список доступных действий
                if (!error) {// если нет ошибок
                    if (!isFirstLine) wsh.stdOut.writeLine();// выводим пустую строчку
                    for (var i = 0, iLen = units.length; i < iLen; i++) {
                        data = units[i];// получаем очередной объект
                        data = app.lib.clone(data);// колонируем для изменений
                        name = "TMP-INDEX"; value = data[name]; isDelim = !value;// этот элимент является разделителем
                        if (!config.noalign) for (var name in count) data[name] = app.lib.strPad(data[name] || "", count[name], app.val.spсDelim, isNaN(app.lib.trim(data[name]).charAt(0)) ? "right" : "left");
                        name = "TMP-INDEX"; if (value = data[name]) data[name] = app.fun.escape("color", config.color && "yellow", value, true);
                        name = "TMP-VALUE"; if (value = data[name]) data[name] = app.fun.escape("color", config.color && "cyan", value, true);
                        name = "TMP-KEY"; if (value = data[name]) if (isDelim) data[name] = app.fun.escape("color", config.color && "yellow", value, true);
                        value = app.fun.setDataPattern(isDelim ? app.fun.clearDelimPattern(config.unit) : config.unit, data, false, true);
                        wsh.stdOut.writeLine(value);
                    };
                    if (!("action" in config)) wsh.stdOut.writeLine();// выводим пустую строчку
                    if (!("action" in config) && config.color) wsh.stdOut.writeLine();// выводим пустую строчку
                    isFirstLine = true;
                };
                // задаём служебные флаги
                if (!error) {// если нет ошибок
                    isNeedInput = !("action" in config);
                };
                // работаем с действием в цикле
                do {// выполняем циклические операции
                    // получаем номер действия от пользователя
                    if (!error) {// если нет ошибок
                        if (isNeedInput) {// если требуется ввод
                            try {// пробуем получить данные
                                i = 0;// начальное значение
                                config.action = null;// сбрасываем значение
                                if (config.color) wsh.stdOut.write(app.fun.escape("cursor", "up", null, true));
                                if (config.color) wsh.stdOut.write(app.fun.escape("color", "default"));
                                wsh.stdOut.write("Введите номер действия: ");
                                if (config.color) wsh.stdOut.write(app.fun.escape("color", "yellow"));
                                value = wsh.stdIn.readLine();// просим ввести строку
                                if (config.color) wsh.stdOut.write(app.fun.escape("color", "default"));
                                value = app.wsh.iconv(app.val.dosCharset, app.val.winCharset, value);
                                value = app.fun.convIndexParam(value)[0];
                                for (var key in action) if (action[key]) if (value == i++) config.action = key;
                                isFirstLine = false;
                            } catch (e) {// если возникли ошибки
                                try {// пробуем выполнить
                                    wsh.stdOut.writeLine();// выводим пустую строчку
                                } catch (e) { };// игнорируем исключения
                                error = 14;
                            };
                        };
                    };
                    // получаем команду целевого действия
                    if (!error) {// если нет ошибок
                        if (config.action in action) {// если действие существует
                            value = action[config.action];
                            command = shell.expandEnvironmentStrings(value);
                        } else error = 15;
                    };
                    // проверяем команду целевого действия
                    if (!error) {// если нет ошибок
                        if (command) {// если не пустая команда
                        } else error = 16;
                    };
                    // подключаемся к удалённому хосту
                    if (!error && config.service) {// если нужно выполнить
                        data = item;// получаем данные
                        try {// пробуем подключиться к компьютеру используя флаг wbemConnectFlagUseMaxWait
                            remote = locator.connectServer(data["NET-HOST"], "root\\CIMV2", null, null, null, null, 0x80);
                        } catch (e) {// если возникли ошибки
                            error = 17;
                        };
                    };
                    // запускаем службу на удалённом хосте
                    if (!error && config.service) {// если нужно выполнить
                        try {// пробуем выполнить на компьютере
                            service = remote.get("Win32_Service.Name='" + config.service + "'");
                            if (service.started || !service.startService()) {// если удалось запустить службу
                            } else error = 19;
                        } catch (e) {// если возникли ошибки
                            error = 18;
                        };
                    };
                    // выполняем команду на локальном хосте
                    if (!error) {// если нет ошибок
                        try {// пробуем выполнить комманду
                            shell.run(command, 1, !config.nowait);
                        } catch (e) {// если возникли ошибки
                            error = 20;
                        };
                    };
                    // останавливаем службу на удалённом хосте
                    if (!error && config.service) {// если нужно выполнить
                        try {// пробуем выполнить на компьютере
                            service = remote.get("Win32_Service.Name='" + config.service + "'");
                            if (!service.started || !service.stopService()) {// если удалось остановить службу
                            } else error = 21;
                        } catch (e) {// если возникли ошибки
                            error = 18;
                        };
                    };
                } while (!error && config.repeat);
            };
            // выводим информацию об ошибке
            if (error) {// если есть ошибка
                value = {// список ошибок
                    1: "Указан не известный конфигурационный параметр.",
                    2: "Не задан ключ для фильтрующего параметра.",
                    3: "Не задан ключ или задано пустое значение для входящего параметра.",
                    4: "Не верно указан параметр действиея.",
                    5: "Не удалось инициировать получение поискового запроса.",
                    6: "Задан несуществующий или неподдерживаемый источник данных.",
                    7: "Обязательные параметры не прошли проверку или отсутствуют.",
                    8: "Задана не допустимая комбинация параметров.",
                    9: "Не удалось подключиться или открыть источник данных.",
                    10: "Не удалось найти подходящие объекты.",
                    11: "Не удалось подключиться к локальному компьютеру.",
                    12: "Не удалось инициировать получение номера объекта.",
                    13: "Отсутствует объект с указанным номером.",
                    14: "Не удалось инициировать получение номера действия.",
                    15: "Отсутствует указанное действие.",
                    16: "Сформирована пустая команды для действия.",
                    17: "Не удалось подключиться к удалённому компьютеру.",
                    18: "Не удалось найти указанную службу на удалённому компьютеру.",
                    19: "Не удалось запустить службу на удалённом компьютере.",
                    20: "Не удалось выполнить комманду указанного действия.",
                    21: "Не удалось остановить службу на удалённом компьютере."
                }[error];
                if (value) {// если есть сообщение
                    value = app.fun.escape("color", config.color && "red", value, true);
                    try {// пробуем выполнить
                        wsh.stdErr.write(value);
                    } catch (e) {// если возникли ошибки
                        wsh.echo(value);
                    };
                };
            };
            // завершаем сценарий кодом
            wsh.quit(error);
        }
    });
})(WSH, search);
// запускаем инициализацию
search.init();