from app.services.execution_engine import ExecutionEngine


class Exporter:
    def export_execution(self, execution_id: int) -> str | None:
        engine = ExecutionEngine()
        execution = engine.get_execution(execution_id)
        if not execution:
            return None

        return (
            "execution_id,rule_id,status,total_rows,failed_rows\n"
            f"{execution.id},{execution.rule_id},{execution.status.value},"
            f"{execution.total_rows},{execution.failed_rows}\n"
        )