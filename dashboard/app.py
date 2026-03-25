"""
ecom-agent Monitoring Dashboard

Usage:
    pip install streamlit requests
    streamlit run dashboard/app.py

Connects to the ecom-agent HTTP API to display real-time metrics.
"""

import streamlit as st
import requests
import time
import json
from datetime import datetime

API_BASE = st.sidebar.text_input("API Base URL", "http://localhost:3000")
REFRESH_INTERVAL = st.sidebar.slider("Refresh interval (sec)", 5, 60, 10)

st.set_page_config(page_title="ecom-agent Monitor", page_icon="📊", layout="wide")
st.title("📊 ecom-agent 监控面板")


def fetch(path: str):
    try:
        r = requests.get(f"{API_BASE}{path}", timeout=5)
        r.raise_for_status()
        return r.json()
    except Exception as e:
        return {"error": str(e)}


def post(path: str, data: dict = None):
    try:
        r = requests.post(f"{API_BASE}{path}", json=data or {}, timeout=5)
        return r.json()
    except Exception as e:
        return {"error": str(e)}


# ─── Health Status ───────────────────────────────────────────────────────────

st.header("🏥 系统健康状态")
health = fetch("/health")

if "error" in health:
    st.error(f"无法连接到 API: {health['error']}")
    st.stop()

col1, col2, col3 = st.columns(3)
status_color = "🟢" if health.get("status") == "ok" else "🟡"
col1.metric("状态", f"{status_color} {health.get('status', 'unknown')}")
col2.metric("运行时间", f"{health.get('uptime', 0)} 秒")
col3.metric("时间", health.get("timestamp", "")[:19])

checks = health.get("checks", {})
if checks:
    check_cols = st.columns(len(checks))
    for i, (name, info) in enumerate(checks.items()):
        icon = "✅" if info.get("status") == "ok" else "❌"
        latency = f" ({info.get('latencyMs', '?')}ms)" if "latencyMs" in info else ""
        check_cols[i].metric(name, f"{icon}{latency}")

st.divider()

# ─── Core Metrics ────────────────────────────────────────────────────────────

st.header("📈 核心指标")
metrics = fetch("/api/metrics")

if "error" not in metrics:
    inf = metrics.get("inference", {})
    guard = metrics.get("guardrails", {})
    errs = metrics.get("errors", {})

    col1, col2, col3, col4, col5 = st.columns(5)
    col1.metric("推理调用总数", inf.get("totalCalls", 0))
    col2.metric("平均延迟", f"{inf.get('avgLatencyMs', 0)}ms")
    col3.metric("降级次数", inf.get("fallbackCount", 0))
    col4.metric("护栏拦截", guard.get("blockedCount", 0))
    col5.metric("错误数", errs.get("totalErrors", 0))

    rec = metrics.get("recommendation", {})
    if rec:
        st.subheader("🎯 推荐质量")
        rcol1, rcol2, rcol3, rcol4 = st.columns(4)
        rcol1.metric("推荐总数", rec.get("totalRecommendations", 0))
        rcol2.metric("准确率", f"{rec.get('accuracyRate', 0)*100:.0f}%")
        rcol3.metric("接受率", f"{rec.get('acceptRate', 0)*100:.0f}%")
        rcol4.metric("覆盖率命中", f"{rec.get('coverageHitRate', 0)*100:.0f}%")

    st.subheader("💻 系统资源")
    sys = metrics.get("system", {})
    scol1, scol2 = st.columns(2)
    scol1.metric("内存使用", f"{sys.get('memoryMB', 0)} MB")
    scol2.metric("运行时间", f"{metrics.get('uptime', 0)} 秒")
else:
    st.warning(f"获取指标失败: {metrics.get('error')}")

st.divider()

# ─── Config Audit & Rollback ─────────────────────────────────────────────────

st.header("⚙️ 配置审计与回滚")
audit = fetch("/api/admin/config/audit")

if "error" not in audit:
    entries = audit.get("entries", [])
    if entries:
        st.dataframe(
            [
                {
                    "时间": e.get("timestamp", "")[:19],
                    "参数": e.get("key"),
                    "旧值": str(e.get("oldValue")),
                    "新值": str(e.get("newValue")),
                    "来源": e.get("source"),
                }
                for e in reversed(entries)
            ],
            use_container_width=True,
        )

        st.subheader("🔄 一键回滚")
        keys = list(set(e.get("key") for e in entries))
        selected_key = st.selectbox("选择要回滚的参数", keys)
        if st.button(f"回滚 {selected_key}"):
            result = post("/api/admin/config/rollback", {"key": selected_key})
            if "error" in result:
                st.error(f"回滚失败: {result['error']}")
            else:
                st.success(
                    f"已回滚 {selected_key}: {result.get('previousValue')} → {result.get('restoredValue')}"
                )
                st.rerun()
    else:
        st.info("暂无配置变更记录")
else:
    st.info("配置审计 API 未启用（需传入 configWatch 到 buildServer）")

st.divider()

# ─── Guardrail Statistics ────────────────────────────────────────────────────

st.header("🛡️ 安全护栏统计")
if "error" not in metrics:
    gcol1, gcol2 = st.columns(2)
    gcol1.metric("总拦截次数", guard.get("blockedCount", 0))
    fallback_rate = inf.get("fallbackCount", 0) / max(inf.get("totalCalls", 1), 1) * 100
    gcol2.metric("降级率", f"{fallback_rate:.1f}%")

st.divider()

# ─── Auto Refresh ────────────────────────────────────────────────────────────

st.caption(f"每 {REFRESH_INTERVAL} 秒自动刷新 | 最后更新: {datetime.now().strftime('%H:%M:%S')}")
time.sleep(REFRESH_INTERVAL)
st.rerun()
