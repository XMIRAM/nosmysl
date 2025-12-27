import os, json, base64, time, random, sqlite3, requests
from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup
from telegram.ext import Application, CommandHandler, ContextTypes

BOT_TOKEN = os.getenv("8515839198:AAFYVzNH6hgFfL_MzFa0C2XF13z0meOD2Q4")
CHANNEL = os.getenv("@zombievirus_server")  # например: "@zombievirus_server"
SITE_URL = os.getenv("https://xmiram.github.io/ZombiVirusglobal-/")  # например: "https://username.github.io/repo/"

# GitHub (чтобы обновлять registry.json)
GH_TOKEN = os.getenv("GH_TOKEN")        # GitHub PAT (repo contents write)
GH_REPO = os.getenv("GH_REPO")          # "owner/repo"
GH_BRANCH = os.getenv("GH_BRANCH", "main")
GH_PATH = os.getenv("GH_PATH", "registry.json")

DB = "zombie.db"

MUTATIONS = [
    "Rotten Wi-Fi", "Deadline Eater", "Doomscroll Parasite", "Coffee Lich",
    "Night Committer", "Shorts Vampire", "NPC Breaker", "Meme Infector"
]

def db():
    con = sqlite3.connect(DB)
    con.execute("""CREATE TABLE IF NOT EXISTS infections(
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tg_user INTEGER NOT NULL,
        nick TEXT NOT NULL,
        strain TEXT NOT NULL,
        from_id INTEGER,
        from_nick TEXT,
        created_at INTEGER NOT NULL
    )""")
    return con

def make_strain():
    a = ''.join(random.choice("ABCDEFGHJKLMNPQRSTUVWXYZ23456789") for _ in range(6))
    return a

def parse_start_payload(s: str):
    # формат: f<from_id>_<from_nick>  (пример: f12_isak)
    if not s: return (None, None)
    try:
        left, right = s.split("_", 1)
        if left.startswith("f"):
            fid = int(left[1:])
            fnick = right[:20]
            return (fid if fid > 0 else None, fnick)
    except:
        pass
    return (None, None)

def gh_get_file():
    url = f"https://api.github.com/repos/{GH_REPO}/contents/{GH_PATH}?ref={GH_BRANCH}"
    r = requests.get(url, headers={"Authorization": f"token {GH_TOKEN}", "Accept": "application/vnd.github+json"}, timeout=20)
    r.raise_for_status()
    data = r.json()
    content = base64.b64decode(data["content"]).decode("utf-8")
    return data["sha"], json.loads(content)

def gh_put_file(new_json: dict, sha: str, message: str):
    url = f"https://api.github.com/repos/{GH_REPO}/contents/{GH_PATH}"
    content = base64.b64encode(json.dumps(new_json, ensure_ascii=False, indent=2).encode("utf-8")).decode("utf-8")
    payload = {"message": message, "content": content, "sha": sha, "branch": GH_BRANCH}
    r = requests.put(url, headers={"Authorization": f"token {GH_TOKEN}", "Accept": "application/vnd.github+json"}, json=payload, timeout=20)
    r.raise_for_status()
    return True

def gh_append_registry(entry: dict):
    sha, reg = gh_get_file()
    reg.setdefault("infections", [])
    reg.setdefault("total", 0)

    # total = max id in list, на всякий
    if reg["infections"]:
        reg["total"] = max(x.get("id", 0) for x in reg["infections"])

    reg["total"] += 1
    entry["id"] = reg["total"]
    reg["infections"].append(entry)
    reg["updated_at"] = time.strftime("%Y-%m-%dT%H:%M:%S.000Z", time.gmtime())
    gh_put_file(reg, sha, f"registry: add infection #{entry['id']}")
    return entry["id"]

async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user = update.effective_user
    payload = (context.args[0] if context.args else "")
    from_id, from_nick = parse_start_payload(payload)

    nick = user.username or user.first_name or "anon"
    nick = (nick[:20]).replace("\n"," ").strip() or "anon"

    # создаём запись + номер
    strain = make_strain()
    created = int(time.time())

    entry = {
        "id": 0,  # будет присвоен при апдейте реестра
        "nick": nick,
        "strain": strain,
        "from_id": from_id,
        "from_nick": from_nick,
        "created_at": time.strftime("%Y-%m-%dT%H:%M:%S.000Z", time.gmtime(created))
    }

    # 1) пишем в GitHub registry.json (даёт глобальный номер)
    new_id = gh_append_registry(entry)

    # 2) пишем в локальную БД (для /top можно, но у нас и так есть registry.json)
    con = db()
    con.execute("INSERT INTO infections(tg_user,nick,strain,from_id,from_nick,created_at) VALUES(?,?,?,?,?,?)",
                (user.id, nick, strain, from_id, from_nick, created))
    con.commit()
    con.close()

    # 3) постим в канал
    bitten = f"битен by #{from_id}" if from_id else "self-infection"
    text = f"🧟 NEW INFECTED: #{new_id}\n@{nick}\nstrain: {strain}\n{bitten}"
    try:
        await context.bot.send_message(chat_id=CHANNEL, text=text)
    except:
        pass

    # 4) даём ссылку обратно на сайт + укус-ссылку
    back = f"{SITE_URL}?id={new_id}&strain={strain}"
    bite = f"{SITE_URL}?from_id={new_id}&from={nick}&strain={strain}"

    kb = InlineKeyboardMarkup([
        [InlineKeyboardButton("OPEN YOUR PROFILE", url=back)],
        [InlineKeyboardButton("COPY BITE LINK", url=bite)],
        [InlineKeyboardButton("SERVER FEED", url=f"https://t.me/{CHANNEL.lstrip('@')}")]
    ])

    msg = (
        f"✅ Ты заражён официально.\n"
        f"Твой номер: #{new_id}\n"
        f"Штамм: {strain}\n\n"
        f"Укуси 3 людей: отправь им BITE LINK.\n"
        f"Чем больше укусов — тем выше ты в топе."
    )
    await update.message.reply_text(msg, reply_markup=kb)

async def mutate(update: Update, context: ContextTypes.DEFAULT_TYPE):
    roll = random.random()
    if roll < 0.01: rank = "LEGENDARY"
    elif roll < 0.05: rank = "EPIC"
    elif roll < 0.20: rank = "RARE"
    else: rank = "COMMON"

    m = random.choice(MUTATIONS)
    txt = f"🧬 MUTATION: {m}\nRANK: {rank}\n\nСкринь и кидай в чат. Пусть завидуют."
    await update.message.reply_text(txt)

def main():
    if not all([BOT_TOKEN, CHANNEL, SITE_URL, GH_TOKEN, GH_REPO]):
        raise RuntimeError("Set env: BOT_TOKEN, CHANNEL, SITE_URL, GH_TOKEN, GH_REPO")
    app = Application.builder().token(BOT_TOKEN).build()
    app.add_handler(CommandHandler("start", start))
    app.add_handler(CommandHandler("mutate", mutate))
    app.run_polling(drop_pending_updates=True)

if __name__ == "__main__":
    main()
