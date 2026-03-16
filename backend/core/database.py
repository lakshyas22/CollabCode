from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase
from core.config import get_settings
from urllib.parse import urlparse, urlunparse, parse_qs, urlencode

settings = get_settings()


def clean_database_url(url: str) -> tuple[str, dict]:
    # Fix the scheme — convert any postgres URL to asyncpg
    for bad in ('postgresql://', 'postgres://', 'postgresql+psycopg2://',
                'postgresql+psycopg://', 'postgres+asyncpg://'):
        if url.startswith(bad):
            url = 'postgresql+asyncpg://' + url[len(bad):]
            break
    if not url.startswith('postgresql+asyncpg://'):
        url = 'postgresql+asyncpg://' + url.split('://', 1)[-1]

    # Strip query params asyncpg cannot handle
    parsed = urlparse(url)
    params = parse_qs(parsed.query, keep_blank_values=True)
    connect_args = {}

    ssl_val = None
    for key in ('sslmode', 'ssl'):
        if key in params:
            ssl_val = params.pop(key)[0]

    for key in ('channel_binding', 'options', 'connect_timeout',
                'application_name', 'keepalives', 'keepalives_idle',
                'keepalives_interval', 'keepalives_count'):
        params.pop(key, None)

    connect_args['ssl'] = 'require'

    clean_query = urlencode({k: v[0] for k, v in params.items()})
    clean_url = urlunparse(parsed._replace(query=clean_query))
    return clean_url, connect_args


db_url, connect_args = clean_database_url(settings.DATABASE_URL)

engine = create_async_engine(
    db_url,
    echo=False,
    pool_pre_ping=True,
    pool_size=5,
    max_overflow=10,
    connect_args=connect_args,
)

AsyncSessionLocal = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autoflush=False,
    autocommit=False,
)


class Base(DeclarativeBase):
    pass


async def get_db():
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


async def init_db():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)