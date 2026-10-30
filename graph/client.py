from neo4j import Driver, GraphDatabase

from trustgraph.settings import Settings, get_settings


class Neo4jClient:
    def __init__(
        self,
        uri: str | None = None,
        username: str | None = None,
        password: str | None = None,
        database: str | None = None,
        settings: Settings | None = None,
    ):
        settings = settings or get_settings()
        self.uri = uri or settings.neo4j_uri
        self.username = username or settings.neo4j_username
        self.password = password or settings.neo4j_password
        self.database = database or settings.neo4j_database
        self.driver: Driver = GraphDatabase.driver(
            self.uri,
            auth=(self.username, self.password),
            connection_timeout=3,
        )

    def verify_connectivity(self) -> None:
        self.driver.verify_connectivity()

    def session(self):
        return self.driver.session(database=self.database)

    def close(self) -> None:
        self.driver.close()
