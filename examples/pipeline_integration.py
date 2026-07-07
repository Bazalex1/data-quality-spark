"""Пример интеграции проверки качества данных в пайплайн."""

import httpx

API_URL = "http://localhost:8000/api"


def create_rule(client: httpx.Client, name: str, expression: str) -> dict:
    response = client.post(
        "/rules/",
        json={"name": name, "description": "Demo rule", "expression": expression},
    )
    response.raise_for_status()
    return response.json()


def run_check(client: httpx.Client, rule_id: int, dataset_path: str) -> dict:
    response = client.post(
        "/executions/",
        json={"rule_id": rule_id, "dataset_path": dataset_path},
    )
    response.raise_for_status()
    return response.json()


def main() -> None:
    with httpx.Client(base_url=API_URL, timeout=60.0) as client:
        health = client.get("/health")
        health.raise_for_status()
        print("Backend:", health.json())

        rule = create_rule(client, "not_null_email", "email IS NOT NULL")
        print("Created rule:", rule)

        execution = run_check(
            client,
            rule_id=rule["id"],
            dataset_path="sample_data/customers_with_errors.csv",
        )
        print("Execution result:", execution)


if __name__ == "__main__":
    main()