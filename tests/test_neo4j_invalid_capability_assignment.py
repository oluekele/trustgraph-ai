"""Unknown capabilities cannot be assigned, so they never appear in the graph."""

import pytest

from trustgraph.errors import ValidationError
from trustgraph.identity.models import Principal, PrincipalKind


def test_unknown_capability_is_rejected_at_registration(tg):
    with pytest.raises(ValidationError, match="Unknown capability"):
        tg.identity.register(Principal(id="agent-new", kind=PrincipalKind.AGENT, name="New",
                                       owner_id="u-ada", capabilities=["quantum.teleport"]))
    assert all(node["id"] != "cap:quantum.teleport" for node in tg.graph_snapshot()["nodes"])
