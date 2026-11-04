#!/bin/bash
# Вдига ?v= на всички модули наведнъж.
#
# Играта е от ES модули, които се внасят един друг. Apache в контейнера е с
# AllowOverride None, тоест .htaccess се игнорира и не може да се изключи
# кешът — а той е общ за всички проекти в Sites/ и не му е тук мястото да се
# пипа. Затова версията стои в адреса на всеки внос: само на входната точка
# не стига, защото браузърът кешира останалите по старите им адреси.
set -euo pipefail
cd "$(dirname "$0")/.."

current=$(grep -o 'main\.js?v=[0-9]*' index.html | head -1 | grep -o '[0-9]*$')
next=$((current + 1))

# входната точка
sed -i '' "s|main\.js?v=[0-9]*|main.js?v=$next|" index.html

# всеки относителен внос в game/
for f in game/*.js; do
  sed -i '' -E "s|(from '\./[A-Za-z0-9_-]+\.js)(\?v=[0-9]+)?'|\1?v=$next'|g" "$f"
done

printf "%s" "$next" > version.txt

echo "версия $current → $next"
grep -h -o "from '\./[a-z]*\.js?v=[0-9]*'" game/*.js | sort -u
