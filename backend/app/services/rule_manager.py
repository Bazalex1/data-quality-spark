from app.schemas.rule import RuleCreate, RuleRead, RuleUpdate

_rules: dict[int, RuleRead] = {}
_next_id = 1


class RuleManager:
    def list_rules(self) -> list[RuleRead]:
        return list(_rules.values())

    def get_rule(self, rule_id: int) -> RuleRead | None:
        return _rules.get(rule_id)

    def create_rule(self, payload: RuleCreate) -> RuleRead:
        global _next_id
        rule = RuleRead(id=_next_id, **payload.model_dump())
        _rules[_next_id] = rule
        _next_id += 1
        return rule

    def update_rule(self, rule_id: int, payload: RuleUpdate) -> RuleRead | None:
        rule = _rules.get(rule_id)
        if not rule:
            return None
        updated = rule.model_copy(update=payload.model_dump(exclude_unset=True))
        _rules[rule_id] = updated
        return updated

    def delete_rule(self, rule_id: int) -> bool:
        return _rules.pop(rule_id, None) is not None