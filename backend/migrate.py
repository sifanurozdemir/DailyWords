from database import engine
from sqlalchemy import text

def run_migration():
    columns = [
        "swipe_match_total_xp INTEGER DEFAULT 0",
        "swipe_match_high_score INTEGER DEFAULT 0"
    ]
    
    for col in columns:
        with engine.connect() as con:
            try:
                con.execute(text(f"ALTER TABLE users ADD COLUMN {col};"))
                con.commit()
                print(f"Sütun eklendi: {col}")
            except Exception as e:
                # Eğer sütun zaten varsa hata verecektir, bunu yoksayabiliriz
                print(f"Bilgi: {col} zaten eklenmiş olabilir veya bir hata oluştu.")
                
if __name__ == "__main__":
    run_migration()
    print("Migration işlemi tamamlandı.")
