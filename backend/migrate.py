from database import engine
from sqlalchemy import text

with engine.connect() as con:
    try:
        con.execute(text("ALTER TABLE users ADD COLUMN bug_hunt_total_xp INTEGER DEFAULT 0;"))
    except Exception as e:
        print(e)
    try:
        con.execute(text("ALTER TABLE users ADD COLUMN bug_hunt_high_score INTEGER DEFAULT 0;"))
    except Exception as e:
        print(e)
    con.commit()

print("Migration done.")
