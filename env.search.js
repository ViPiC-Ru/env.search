/* 1.2.0 ищет данне для переменных среды

cscript env.search.min.js [<mode> [<container>]] [<option>...] [<input>...] \\ [<action>...]

<mode>      - Режим поиска данных для переменных среды.
    folder  - Получение данных из папки с ini файлами.
    ldap    - Получение данных из active directory.
<container> - Путь к папки или guid (допускается пустое значение).
<option>    - Дополнительные опции (может быть несколько, порядок не важен).
    search  - Поисковой запрос (можно опустить, будет запрошен в процессе).
    index   - Номер компьютера в выборке (можно опустить, будет запрошен в процессе).
    action  - Ключ действия (можно опустить, будет запрошен в процессе).
    item    - Шаблон представления компьютеров в выборке (доступны переменные).
    unit    - Шаблон представления других списков (доступны переменные).
    service - Имя службы, которую нужно запустить перед выполнением команды действия.
    check   - Флаг проверки доступности целевых компьютеров.
    user    - Флаг запроса информации по пользователю (только для режима ldap).
    noalign - Флаг запрета выравнивания выборок и списков.
    nowait  - Флаг выполнения действия без ожидания (только при отсутствии service).
    color   - Флаг использования цветового оформления.
<input>     - Шаблоны для получения данных из свойств компьютера (только для режима ldap).
<action>    - Действия в формате ключ и команда (доступны переменные).

*/

var search = new App({
    argWrap: '"',                                       // основное обрамление аргументов
    altWrap: "'",                                       // альтернативное обрамление аргументов
    envWrap: '%',                                       // основное обрамление переменных
    keyDelim: "=",                                      // разделитель ключа от значения
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
                        value = input.substr(i, key.length);
                        flag = value.toLowerCase() == key;
                        if (flag) break;
                    };
                    // форматируем регистр
                    if (flag) {// если найдено совпадение
                        flag = value == value.toLowerCase();
                        if (!flag) {// если не всё в нижнем регистре
                            value = input.substr(i + key.length, 1);
                            flag = value == value.toUpperCase();
                            if (!flag) {// если далее идёт нижний регистр
                                value = rule[key].substr(0, 1).toUpperCase() + rule[key].substr(1);
                            } else value = rule[key].toUpperCase();
                        } else value = rule[key];
                        // добовляем смещение
                        i += key.length - 1;
                    } else value = input.substr(i, 1);
                    // формируем резултат
                    output += value;
                };
                // возвращаем результат
                return output;
            },

            /**
             * Считает количество ключей в объекте.
             * @param {object} object - Объект для подсчёта.
             * @returns {number} Количество ключей в объекте.
             */

            count: function (object) {
                var index = 0;
                if (object) for (var key in object) index++;
                // возвращаем результат
                return index;
            },

            /**
             * Раскрашиваем текст для вывода в консоль.
             * @param {string} name - Название поддерживаемого цвета.
             * @param {string} [text] - Текст для раскрашивания.
             * @param {boolean} [nowrap] - Не оборачивать.
             * @returns {string} Раскрашенный текст.
             */

            color: function (name, text, nowrap) {
                var value, index, prefix, suffix, index;

                suffix = "m";
                text = text ? "" + text : "";
                prefix = String.fromCharCode(27) + "[";
                switch (name) {// поддерживаемые цвета
                    // styles
                    case "reset": index = 0; break;
                    // strong foreground colors
                    case "black": index = 90; break;
                    case "red": index = 91; break;
                    case "green": index = 92; break;
                    case "yellow": index = 93; break;
                    case "blue": index = 94; break;
                    case "purple": index = 95; break;
                    case "cyan": index = 96; break;
                    case "white": index = 97; break;
                };
                if (!isNaN(index)) {// если цвет распознан
                    value = prefix + index + suffix + text;
                    if (!nowrap) value += prefix + 0 + suffix;
                } else value = text;
                // возвращаем результат
                return value;
            },

            /**
             * Получает значение свойства ADSI объекта.
             * @param {ADSI} item - ADSI объект для получения данных.
             * @param {string} property - Свойство ADSI объекта с данными.
             * @returns {string} Значение свойства ADSI объекта.
             */

            getItemProperty: function (item, property) {
                var value = "";

                try {// пробуем получить данные
                    value = item.get(property);
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
                var list, index, fragment, key, offset = 0,
                    data = {}, error = 0;

                value = value ? "" + value : "";
                pattern = pattern ? "" + pattern : "";
                list = pattern.split(app.val.envWrap);
                for (var i = 0, iLen = list.length; i < iLen && !error; i++) {
                    fragment = list[i];// получаем фрагмент
                    if (i % 2 && i != iLen - 1) {// если это ключ
                        key = strict ? fragment : fragment.toUpperCase();
                        if (key) {// если ключ задан
                            fragment = list[i + 1];// получаем фрагмент
                            if (!fragment.length) index = value.length;
                            else index = value.indexOf(fragment, offset);
                            if (~index) {// если найдено совпадение
                                data[key] = value.substr(offset, index - offset);
                                offset = index;
                            } else error = 3;
                        } else error = 2;
                    } else {// если это не ключ
                        index = value.indexOf(fragment, offset);
                        if (offset == index) {// если найдено совпадение
                            offset += fragment.length;
                        } else error = 1;
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
             * @returns {string} Заполненный шаблон с данными.
             */

            setDataPattern: function (pattern, data, strict) {
                var list, fragment, value;

                data = data || {};// по умолчанию
                pattern = pattern ? "" + pattern : "";
                list = pattern.split(app.val.envWrap);
                for (var i = 0, iLen = list.length; i < iLen; i++) {
                    if (i % 2 && i != iLen - 1) {// если это ключ
                        fragment = list[i];// получаем фрагмент
                        list[i] = "";// сбрасываем значение
                        for (var key in data) {// пробигаемся по данным
                            if (!app.lib.compare(key, fragment, !strict)) {
                                list[i] = data[key];
                            };
                        };
                    };
                };
                value = list.join("");
                // возвращаем результат
                return value;
            }
        },
        init: function () {// функция инициализации приложения
            var key, value, index, length, list, mode, container, fso, shell, isDelim, file,
                files, path, units, data, locator, local, remote, response, computers, users, count,
                service, command, item, items = [], config = {}, input = {}, action = {},
                isFirstLine = true, error = 0;

            shell = new ActiveXObject("WScript.Shell");
            fso = new ActiveXObject("Scripting.FileSystemObject");
            locator = new ActiveXObject("wbemScripting.Swbemlocator");
            locator.security_.impersonationLevel = 3;// Impersonate
            // получаем параметры
            if (!error) {// если нет ошибок
                length = wsh.arguments.length;// получаем длину
                for (index = 0; index < length; index++) {// пробигаемся по параметрам
                    value = wsh.arguments.item(index);// получаем очередное значение
                    // запуск службы на удалённом хосте
                    if (!("service" in config)) {// если нет в конфигурации
                        key = app.lib.strim(value, null, app.val.keyDelim, false, false).toLowerCase();
                        if ("service" == key) {// если пройдена основная проверка
                            value = app.lib.strim(value, app.val.keyDelim, null, false, false);
                            list = value.split(app.val.argWrap);// вспомогательная переменная
                            if (3 == list.length && !list[0] && !list[2]) value = list[1];
                            config[key] = value;
                            continue;// переходим к следующему параметру
                        };
                    };
                    // оформление строки с целевым объектом
                    if (!("item" in config)) {// если нет в конфигурации
                        key = app.lib.strim(value, null, app.val.keyDelim, false, false).toLowerCase();
                        if ("item" == key) {// если пройдена основная проверка
                            value = app.lib.strim(value, app.val.keyDelim, null, false, false);
                            list = value.split(app.val.argWrap);// вспомогательная переменная
                            if (3 == list.length && !list[0] && !list[2]) value = list[1];
                            config[key] = value;
                            continue;// переходим к следующему параметру
                        };
                    };
                    // оформление строки с другим элиментом
                    if (!("unit" in config)) {// если нет в конфигурации
                        key = app.lib.strim(value, null, app.val.keyDelim, false, false).toLowerCase();
                        if ("unit" == key) {// если пройдена основная проверка
                            value = app.lib.strim(value, app.val.keyDelim, null, false, false);
                            list = value.split(app.val.argWrap);// вспомогательная переменная
                            if (3 == list.length && !list[0] && !list[2]) value = list[1];
                            config[key] = value;
                            continue;// переходим к следующему параметру
                        };
                    };
                    // поисковой запрос
                    if (!("search" in config)) {// если нет в конфигурации
                        key = app.lib.strim(value, null, app.val.keyDelim, false, false).toLowerCase();
                        if ("search" == key) {// если пройдена основная проверка
                            value = app.lib.strim(value, app.val.keyDelim, null, false, false);
                            list = value.split(app.val.argWrap);// вспомогательная переменная
                            if (3 == list.length && !list[0] && !list[2]) value = list[1];
                            config[key] = value;
                            continue;// переходим к следующему параметру
                        };
                    };
                    // порядковый номер
                    if (!("index" in config)) {// если нет в конфигурации
                        key = app.lib.strim(value, null, app.val.keyDelim, false, false).toLowerCase();
                        if ("index" == key) {// если пройдена основная проверка
                            value = app.lib.strim(value, app.val.keyDelim, null, false, false);
                            list = value.split(app.val.argWrap);// вспомогательная переменная
                            if (3 == list.length && !list[0] && !list[2]) value = list[1];
                            value = !isNaN(value) ? Number(value) - 1 : -1;
                            config[key] = value;
                            continue;// переходим к следующему параметру
                        };
                    };
                    // идентификатор действия
                    if (!("action" in config)) {// если нет в конфигурации
                        key = app.lib.strim(value, null, app.val.keyDelim, false, false).toLowerCase();
                        if ("action" == key) {// если пройдена основная проверка
                            value = app.lib.strim(value, app.val.keyDelim, null, false, false);
                            list = value.split(app.val.argWrap);// вспомогательная переменная
                            if (3 == list.length && !list[0] && !list[2]) value = list[1];
                            config[key] = value;
                            continue;// переходим к следующему параметру
                        };
                    };
                    // проверка доступности удалённого хоста
                    if (!("check" in config)) {// если нет в конфигурации
                        if (!app.lib.compare("check", value, true)) {// если пройдена основная проверка
                            config.check = true;// задаём значение
                            continue;// переходим к следующему параметру
                        };
                    };
                    // получение данных о пользователе
                    if (!("user" in config)) {// если нет в конфигурации
                        if (!app.lib.compare("user", value, true)) {// если пройдена основная проверка
                            config.user = true;// задаём значение
                            continue;// переходим к следующему параметру
                        };
                    };
                    // использование цветового оформления
                    if (!("color" in config)) {// если нет в конфигурации
                        if (!app.lib.compare("color", value, true)) {// если пройдена основная проверка
                            config.color = true;// задаём значение
                            continue;// переходим к следующему параметру
                        };
                    };
                    // запрет выравнивания списков
                    if (!("noalign" in config)) {// если нет в конфигурации
                        if (!app.lib.compare("noalign", value, true)) {// если пройдена основная проверка
                            config.noalign = true;// задаём значение
                            continue;// переходим к следующему параметру
                        };
                    };
                    // выполнить без ожидания
                    if (!("nowait" in config)) {// если нет в конфигурации
                        if (!app.lib.compare("nowait", value, true)) {// если пройдена основная проверка
                            config.nowait = true;// задаём значение
                            continue;// переходим к следующему параметру
                        };
                    };
                    // режим поиска данных
                    if (0 == index && !mode) {// если нужно выполнить
                        if (app.val.putDelim != value) {// если не разделитель потоков
                            mode = value.toLowerCase();// присваиваем значение
                            continue;// переходим к следующему параметру
                        };
                    };
                    // контейнер для поиска данных
                    if (1 == index && !container && mode) {// если нужно выполнить
                        if (app.val.putDelim != value) {// если не разделитель потоков
                            container = value;// присваиваем значение
                            continue;// переходим к следующему параметру
                        };
                    };
                    // если закончились параметры конфигурации
                    break;// остававливаем получние параметров
                };
            };
            // вносим поправки для конфигурации
            if (!("item" in config)) config.item = "%NET-HOST%";
            if (!("unit" in config)) config.unit = "%TMP-KEY%";
            // получаем входящие параметры
            if (!error) {// если нет ошибок
                isDelim = false;// сбрасываем значение
                while (index < length && !isDelim && !error) {
                    value = wsh.arguments.item(index);// получаем значение
                    if (app.val.putDelim != value) {// если не разделитель потоков
                        key = app.lib.strim(value, null, app.val.keyDelim, false, false).toLowerCase();
                        if (key) {// если параметр имеет нужный формат
                            value = app.lib.strim(value, app.val.keyDelim, null, false, false);
                            list = value.split(app.val.argWrap);// вспомогательная переменная
                            if (3 == list.length && !list[0] && !list[2]) value = list[1];
                            input[key] = value;
                        } else error = 1;
                    } else isDelim = true;
                    index++;
                };
            };
            // получаем параметры действий
            if (!error) {// если нет ошибок
                while (index < length && !error) {
                    value = wsh.arguments.item(index);// получаем значение
                    key = app.lib.strim(value, null, app.val.keyDelim, false, false);
                    if (key) {// если параметр имеет нужный формат
                        value = app.lib.strim(value, app.val.keyDelim, null, false, false);
                        list = value.split(app.val.argWrap);// вспомогательная переменная
                        if (3 == list.length && !list[0] && !list[2]) value = list[1];
                        value = value.split(app.val.altWrap).join(app.val.argWrap);
                        action[key] = value;
                    } else error = 2;
                    index++;
                };
            };
            // получаем поисковой запрос от пользователя
            if (!error && mode) {// если нужно выполнить
                if (!("search" in config)) {// если нет в конфигурации
                    try {// пробуем получить данные
                        wsh.stdOut.write("Введите поисковой запрос: ");
                        if (config.color) wsh.stdOut.write(app.fun.color("yellow", "", true));
                        value = wsh.stdIn.readLine();// просим ввести строку
                        if (config.color) wsh.stdOut.write(app.fun.color("reset", "", true));
                        value = app.wsh.iconv("cp866", "windows-1251", value);
                        config.search = value;
                        isFirstLine = false;
                    } catch (e) {// если возникли ошибки
                        try {// пробуем выполнить
                            wsh.stdOut.writeLine();// выводим пустую строчку
                        } catch (e) { };// игнорируем исключения
                        error = 3;
                    };
                };
            };
            // выполняем поиск в указанном режиме
            switch (mode) {// поддерживаемые режимы
                case "folder":// папка с файлами
                    // проверяем обязательные параметры
                    if (!error) {// если нет ошибок
                        if (// множественное условие
                            (config.unit || !app.fun.count(action)) && config.item
                        ) {// если проверка пройдена
                        } else error = 5;
                    };
                    // проверяем запрещённые параметры
                    if (!error) {// если нет ошибок
                        if (// множественное условие
                            (!config.nowait || config.nowait && !config.service)
                            && !app.fun.count(input)
                            && !config.user
                        ) {// если проверка пройдена
                        } else error = 6;
                    };
                    // получаем контейнер
                    if (!error) {// если нет ошибок
                        path = fso.getAbsolutePathName(container);
                        if (fso.folderExists(path)) {// если контейнер существует
                            container = fso.getFolder(path);
                        } else error = 7;
                    };
                    // выполняем поиск целевых объектов
                    if (!error) {// если нет ошибок
                        files = new Enumerator(container.files);
                        while (!files.atEnd()) {// пока не достигнут конец
                            file = files.item();// получаем очередной элимент коллекции
                            files.moveNext();// переходим к следующему элименту
                            value = app.wsh.getFileText(file.path);
                            data = app.lib.ini2obj(value, false);
                            if (// множественное условие
                                !config.search
                                || app.lib.hasValue(data["NET-MAC"] || "", config.search, false)
                                || app.lib.hasValue(data["SYS-KEY"] || "", config.search, false)
                                || app.lib.hasValue(data["NET-HOST"] || "", config.search, false)
                                || app.lib.hasValue(data["USR-NAME"] || "", config.search, false)
                                || app.lib.hasValue(data["DEV-NAME"] || "", config.search, false)
                                || app.lib.hasValue(data["NET-IP-V4"] || "", config.search, false)
                                || app.lib.hasValue(data["SYS-VERSION"] || "", config.search, false)
                                || app.lib.hasValue(data["USR-ACCOUNT"] || "", config.search, false)
                                || app.lib.hasValue(data["DEV-DESCRIPTION"] || "", config.search, false)
                                || app.lib.hasValue(data["PCB-BIOS-SERIAL"] || "", config.search, false)
                                || app.lib.hasValue(data["USR-NAME"] || "", app.fun.translit(config.search), false)
                            ) {// если найдено совпадение
                                // добавляем объект в список
                                if (data["NET-HOST"]) items.push(data);
                            };
                        };
                    };
                    break;
                case "ldap":// домен
                    // проверяем обязательные параметры
                    if (!error) {// если нет ошибок
                        if (// множественное условие
                            (config.unit || !app.fun.count(action)) && config.item
                            && (!container || app.lib.validate(container, "guid"))
                        ) {// если проверка пройдена
                        } else error = 5;
                    };
                    // проверяем запрещённые параметры
                    if (!error) {// если нет ошибок
                        if (// множественное условие
                            (!config.nowait || config.nowait && !config.service)
                        ) {// если проверка пройдена
                        } else error = 6;
                    };
                    // получаем контейнер
                    if (!error) {// если нет ошибок
                        container = app.wsh.getLDAP(container)[0];
                        if (container) {// если контейнер существует
                        } else error = 7;
                    };
                    // выполняем поиск компьютеров
                    if (!error) {// если нет ошибок
                        computers = app.wsh.getLDAP(
                            "WHERE objectClass = 'Computer'" +
                            (config.search ? " AND (" +
                                "name = '*" + config.search + "*'" +
                                " OR description = '*" + config.search + "*'" +
                                " OR operatingSystemVersion = '*" + config.search + "*'" +
                                " OR description = '*" + app.fun.translit(config.search) + "*'" +
                                ")" : ""),
                            container
                        );
                    };
                    // выполняем получение данных по целевым объектам
                    if (!error) {// если нет ошибок
                        length = computers.length;// получаем длину
                        for (index = 0; index < length; index++) {
                            item = computers[index];// получаем очередной объект
                            data = {};// сбрасываем значение
                            // работаем с компьютером
                            if (value = app.fun.getItemProperty(item, "cn")) data["NET-HOST"] = value;
                            if (value = app.fun.getItemProperty(item, "distinguishedName")) data["NET-HOST-DN"] = value;
                            if (value = app.fun.getItemProperty(item, "operatingSystem")) data["SYS-NAME"] = value;
                            if (value = app.fun.getItemProperty(item, "operatingSystemVersion").replace(" (", ".").replace(")", "")) data["SYS-VERSION"] = value;
                            for (var key in input) data = app.lib.extend(data, app.fun.getDataPattern(input[key], app.fun.getItemProperty(item, key), false));
                            // получаем данные о пользователе
                            if (config.user && data["USR-NAME-FIRST"] && data["USR-NAME-SECOND"]) {// если нужно дозапросить данные
                                users = app.wsh.getLDAP(
                                    "WHERE objectClass = 'User'" +
                                    " AND sn = '" + data["USR-NAME-FIRST"] + "'" +
                                    " AND givenName = '" + data["USR-NAME-SECOND"] + "'",
                                    container
                                );
                                if (users.length) {// если удалось получить данные
                                    item = users[0];// получаем очередной объект
                                    // работаем с пользователем
                                    if (value = app.fun.getItemProperty(item, "co")) data["USR-COUNTRY"] = value;
                                    if (value = app.fun.getItemProperty(item, "c")) data["USR-COUNTRY-ID"] = value;
                                    if (value = app.fun.getItemProperty(item, "company")) data["USR-COMPANY"] = value;
                                    if (value = app.fun.getItemProperty(item, "displayName")) data["USR-NAME"] = value;
                                    if (value = app.fun.getItemProperty(item, "department")) data["USR-DEPARTMENT"] = value;
                                    if (value = app.fun.getItemProperty(item, "homeDirectory")) data["USR-HOME"] = value;
                                    if (value = app.fun.getItemProperty(item, "l")) data["USR-CITY"] = value;
                                    if (value = app.fun.getItemProperty(item, "mail")) data["USR-EMAIL"] = value;
                                    if (value = app.fun.getItemProperty(item, "mobile")) data["USR-MOBILE"] = value;
                                    if (value = app.fun.getItemProperty(item, "objectSid")) data["USR-SID"] = value;
                                    if (value = app.fun.getItemProperty(item, "sAMAccountName")) data["USR-ACCOUNT"] = value;
                                    if (value = app.fun.getItemProperty(item, "telephoneNumber")) data["USR-PHONE"] = value;
                                    if (value = app.fun.getItemProperty(item, "title")) data["USR-POSITION"] = value;
                                    if (value = app.fun.getItemProperty(item, "info")) data["USR-INFO"] = value;
                                };
                            };
                            // добавляем объект в список
                            if (data["NET-HOST"]) items.push(data);
                        };
                    };
                    break;
                default:// не поддерживаемый режим
                    // обрабатываем не поддерживаемый режим
                    if (!error) {// если нет ошибок
                        if (!mode) {// если не задан режим
                        } else error = 4;
                    };
                    // проверяем обязательные параметры
                    if (!error) {// если нет ошибок
                        if (// множественное условие
                            app.fun.count(action) && config.unit
                        ) {// если проверка пройдена
                        } else error = 5;
                    };
                    // проверяем запрещённые параметры
                    if (!error) {// если нет ошибок
                        if (// множественное условие
                            !app.fun.count(input)
                            && !("search" in config)
                            && !("index" in config)
                            && !config.service
                            && !config.check
                            && !config.user
                        ) {// если проверка пройдена
                        } else error = 6;
                    };
            };
            // проверяем список целевых объектов
            if (!error && mode) {// если нужно выполнить
                if (items.length) {// если список не пуст
                } else error = 8;
            };
            // работаем в зависимости от наличия целевых объектов
            if (items.length) {// если список целевых объектов не пуст
                // работаем с проверкой доступности
                if (config.check) {// если требуется проверка
                    // подключаемся к локальному хосту
                    if (!error) {// если нет ошибок
                        try {// пробуем подключиться к компьютеру
                            local = locator.connectServer("", "root\\CIMV2");
                        } catch (e) {// если возникли ошибки
                            error = 9;
                        };
                    };
                    // проверяем на доступность целевые объекты
                    if (!error) {// если нет ошибок
                        length = items.length;// получаем длину
                        for (index = 0; index < length; index++) {
                            data = items[index];// получаем очередной объект
                            // выполняем запрос
                            response = local.execQuery(
                                "SELECT responseTime, statusCode" +
                                " FROM Win32_PingStatus" +
                                " WHERE address = '" + data["NET-HOST"] + "'" +
                                " AND timeout = 600"
                            );
                            // обрабатываем ответ
                            response = new Enumerator(response);
                            while (!response.atEnd()) {// пока не достигнут конец
                                item = response.item();// получаем очередной элимент коллекции
                                response.moveNext();// переходим к следующему элименту
                                // работаем с элиментом
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
                    length = items.length;// получаем длину
                    for (index = 0; index < length; index++) {
                        data = items[index];// получаем очередной объект
                        data["TMP-INDEX"] = app.lib.strPad(index + 1, ("" + length).length, "0", "left");
                        if (!config.noalign) for (var key in data) count[key] = Math.max(data[key].length, count[key] || 0);
                    };
                };
                // выыодим список целевых объектов
                if (!error) {// если нет ошибок
                    length = items.length;// получаем длину
                    if (!isFirstLine) wsh.stdOut.writeLine();// выводим пустую строчку
                    for (index = 0; index < length; index++) {
                        data = items[index];// получаем очередной объект
                        data = app.lib.clone(data);// колонируем для изменений
                        if (!config.noalign) for (var key in count) data[key] = app.lib.strPad(data[key] || "", count[key], " ", isNaN(app.lib.trim(data[key]).charAt(0)) ? "right" : "left");
                        if (value = data["TMP-INDEX"]) data["TMP-INDEX"] = app.fun.color(config.color ? "yellow" : null, value);
                        if (value = data["NET-HOST"]) data["NET-HOST"] = app.fun.color(config.color ? "cyan" : null, value);
                        value = app.fun.setDataPattern(config.item, data, false);
                        wsh.stdOut.writeLine(value);
                    };
                    if (app.fun.count(action)) wsh.stdOut.writeLine();// выводим пустую строчку
                    isFirstLine = true;
                };
            };
            // работаем в зависимости от наличия действий
            item = null;// сбрасываем информацию об целевом объекте
            if (app.fun.count(action)) {// если список действий не пуст
                // работаем в зависимости от наличия целевых объектов
                if (items.length) {// если список целевых объектов не пуст
                    // получаем номер компьютера от пользователя
                    if (!error) {// если нет ошибок
                        if (!("index" in config)) {// если нет в конфигурации
                            try {// пробуем получить данные
                                wsh.stdOut.write("Введите номер компьютера: ");
                                if (config.color) wsh.stdOut.write(app.fun.color("yellow", "", true));
                                value = wsh.stdIn.readLine();// просим ввести строку
                                if (config.color) wsh.stdOut.write(app.fun.color("reset", "", true));
                                value = app.wsh.iconv("cp866", "windows-1251", value);
                                value = !isNaN(value) ? Number(value) - 1 : -1;
                                config.index = value;
                                isFirstLine = false;
                            } catch (e) {// если возникли ошибки
                                try {// пробуем выполнить
                                    wsh.stdOut.writeLine();// выводим пустую строчку
                                } catch (e) { };// игнорируем исключения
                                error = 10;
                            };
                        };
                    };
                    // получаем целевой объект по порядковому номеру
                    if (!error) {// если нет ошибок
                        item = items[config.index];
                        if (item) {// если объект получен
                        } else error = 11;
                    };
                    // добавляем переменные во временное окружение
                    if (!error) {// если нет ошибок
                        data = item;// получаем данные
                        items = shell.environment(app.val.envType);
                        for (var key in data) {// пробигаемся по списку с данными
                            value = data[key];// получаем очередное значение
                            setEnv(items, key, value);
                        };
                    };
                };
                // выполняем подсчёт значений
                if (!error) {// если нет ошибок
                    units = [];// сбрасываем значение
                    count = {};// сбрасываем значение
                    index = 0;// сбрасываем значение
                    length = app.fun.count(action);
                    for (var key in action) {// пробигаемся по действиям
                        data = {};// сбрасываем значение
                        data["TMP-KEY"] = key;
                        data["TMP-VALUE"] = shell.expandEnvironmentStrings(action[key]);
                        data["TMP-INDEX"] = app.lib.strPad(index + 1, ("" + length).length, "0", "left");
                        if (!config.noalign) for (var key in data) count[key] = Math.max(data[key].length, count[key] || 0);
                        units.push(data);
                        index++;
                    };
                };
                // выыодим список доступных действий
                if (!error) {// если нет ошибок
                    length = units.length;// получаем длину
                    if (!isFirstLine) wsh.stdOut.writeLine();// выводим пустую строчку
                    for (index = 0; index < length; index++) {
                        data = units[index];// получаем очередной объект
                        data = app.lib.clone(data);// колонируем для изменений
                        if (!config.noalign) for (var key in count) data[key] = app.lib.strPad(data[key] || "", count[key], " ", isNaN(app.lib.trim(data[key]).charAt(0)) ? "right" : "left");
                        if (value = data["TMP-VALUE"]) data["TMP-VALUE"] = app.fun.color(config.color ? "cyan" : null, value);
                        if (value = data["TMP-INDEX"]) data["TMP-INDEX"] = app.fun.color(config.color ? "yellow" : null, value);
                        value = app.fun.setDataPattern(config.unit, data, false);
                        wsh.stdOut.writeLine(value);
                    };
                    if (!("action" in config)) wsh.stdOut.writeLine();// выводим пустую строчку
                    isFirstLine = true;
                };
                // получаем номер действия от пользователя
                if (!error) {// если нет ошибок
                    if (!("action" in config)) {// если нет в конфигурации
                        try {// пробуем получить данные
                            index = 0;// сбрасываем значение
                            wsh.stdOut.write("Введите номер действия: ");
                            if (config.color) wsh.stdOut.write(app.fun.color("yellow", "", true));
                            value = wsh.stdIn.readLine();// просим ввести строку
                            if (config.color) wsh.stdOut.write(app.fun.color("reset", "", true));
                            value = app.wsh.iconv("cp866", "windows-1251", value);
                            value = !isNaN(value) ? Number(value) - 1 : -1;
                            for (var key in action) if (index++ == value) config.action = key;
                            isFirstLine = false;
                        } catch (e) {// если возникли ошибки
                            try {// пробуем выполнить
                                wsh.stdOut.writeLine();// выводим пустую строчку
                            } catch (e) { };// игнорируем исключения
                            error = 12;
                        };
                    };
                };
                // получаем команду целевого действия
                if (!error) {// если нет ошибок
                    if (config.action in action) {// если действие существует
                        value = action[config.action];
                        command = shell.expandEnvironmentStrings(value);
                    } else error = 13;
                };
            };
            // работаем в зависимости от наличия команды
            if (command) {// если есть команда для выполнения
                // подключаемся к удалённому хосту
                if (!error && config.service) {// если нужно выполнить
                    data = item;// получаем данные
                    try {// пробуем подключиться к компьютеру
                        remote = locator.connectServer(data["NET-HOST"], "root\\CIMV2");
                    } catch (e) {// если возникли ошибки
                        error = 14;
                    };
                };
                // запускаем службу на удалённом хосте
                if (!error && config.service) {// если нужно выполнить
                    try {// пробуем выполнить на компьютере
                        service = remote.get("Win32_Service.Name='" + config.service + "'");
                        if (service.started || !service.startService()) {// если удалось запустить службу
                        } else error = 16;
                    } catch (e) {// если возникли ошибки
                        error = 15;
                    };
                };
                // выполняем команду на локальном хосте
                if (!error) {// если нет ошибок
                    try {// пробуем выполнить комманду
                        shell.run(command, 1, !config.nowait);
                    } catch (e) {// если возникли ошибки
                        error = 17;
                    };
                };
                // останавливаем службу на удалённом хосте
                if (!error && config.service) {// если нужно выполнить
                    try {// пробуем выполнить на компьютере
                        service = remote.get("Win32_Service.Name='" + config.service + "'");
                        if (!service.started || !service.stopService()) {// если удалось остановить службу
                        } else error = 18;
                    } catch (e) {// если возникли ошибки
                        error = 15;
                    };
                };
            };
            // выводим информацию об ошибке
            if (error) {// если есть ошибка
                value = {// список ошибок
                    1: "У входящего параметра отсутствует значение.",
                    2: "У параметра с действием отсутствует значение.",
                    3: "Не удалось инициировать получение поискового запроса.",
                    4: "Указан не поддерживаемый режим.",
                    5: "Обязательные параметры не прошли проверку или отсутствуют.",
                    6: "Задана не допустимая комбинация параметров.",
                    7: "Не удалось получить контейнер для поиска данных.",
                    8: "Не удалось найти подходящие компьютеры.",
                    9: "Не удалось подключиться к локальному компьютеру.",
                    10: "Не удалось инициировать получение номера компьютера.",
                    11: "Отсутствует компьютер с указанным номером.",
                    12: "Не удалось инициировать получение номера действия.",
                    13: "Отсутствует указанное действие.",
                    14: "Не удалось подключиться к удалённому компьютеру.",
                    15: "Не удалось найти указанную службу на удалённому компьютеру.",
                    16: "Не удалось запустить службу на удалённом компьютере.",
                    17: "Не удалось выполнить комманду действия.",
                    18: "Не удалось остановить службу на удалённом компьютере."
                }[error];
                if (value) {// если есть сообщение
                    value = app.fun.color(config.color ? "red" : null, value);
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