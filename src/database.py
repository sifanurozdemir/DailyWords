# database.py

from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from dotenv import load_dotenv
import os

# 1. .env dosyasını yükle
load_dotenv()

# .env dosyasından bağlantı bilgilerini alın
DB_USER = os.getenv("DB_USER")
DB_PASSWORD = os.getenv("DB_PASSWORD")
DB_HOST = os.getenv("DB_HOST")
DB_PORT = os.getenv("DB_PORT")
DB_NAME = os.getenv("DB_NAME")

# 2. PostgreSQL Bağlantı URL'si
# Bu format, SQLAlchemy'nin veritabanına bağlanmasını sağlar
SQLALCHEMY_DATABASE_URL = f"postgresql://{DB_USER}:{DB_PASSWORD}@{DB_HOST}:{DB_PORT}/{DB_NAME}"

# 3. Veritabanı Motoru
# 'create_engine', SQLAlchemy'nin veritabanına bağlanmasını sağlar
engine = create_engine(SQLALCHEMY_DATABASE_URL)

# 4. Oturum Oluşturucu (SessionLocal)
# Veritabanı ile konuşmak için her istekle bir oturum (session) oluşturacağız.
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# 5. Temel Sınıf (Base)
# Veritabanı modellerimizi tanımlamak için kullanacağımız temel sınıf
Base = declarative_base()