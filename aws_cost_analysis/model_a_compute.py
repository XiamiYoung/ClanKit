#!/usr/bin/env python3
"""
Model A: Thin Client + Server-Side Agent Loop
ECS Fargate Cost Estimation for 4000 users, ap-southeast-1
"""
import json

print("=" * 80)
print("MODEL A: THIN CLIENT + SERVER-SIDE AGENT LOOP")
print("ECS Fargate Infrastructure Sizing & Cost Estimation")
print("Region: ap-southeast-1 (Singapore)")
print("=" * 80)

# ============================================================================
# ASSUMPTIONS & PARAMETERS
# ============================================================================
TOTAL_USERS = 4000
CONCURRENT_RATIO = 0.20  # 20% concurrent = 800 users
CONCURRENT_USERS = int(TOTAL_USERS * CONCURRENT_RATIO)

# Utilization scenarios
SCENARIOS = {
    "low": {
        "label": "Low Utilization",
        "concurrent_ratio": 0.12,  # 480 concurrent
        "avg_session_hours": 4,    # hours/day per active user
        "sessions_per_day": 2,
        "active_days": 20,         # workdays/month
        "daily_active_pct": 0.60,  # 60% of users active on any given day
        "tool_calls_per_session": 15,
        "avg_message_pairs_per_session": 20,
    },
    "medium": {
        "label": "Medium Utilization",
        "concurrent_ratio": 0.20,  # 800 concurrent
        "avg_session_hours": 6,
        "sessions_per_day": 3,
        "active_days": 22,
        "daily_active_pct": 0.75,
        "tool_calls_per_session": 30,
        "avg_message_pairs_per_session": 40,
    },
    "high": {
        "label": "High Utilization",
        "concurrent_ratio": 0.30,  # 1200 concurrent
        "avg_session_hours": 8,
        "sessions_per_day": 4,
        "active_days": 22,
        "daily_active_pct": 0.90,
        "tool_calls_per_session": 50,
        "avg_message_pairs_per_session": 60,
    }
}

# ============================================================================
# FARGATE PRICING - ap-southeast-1 (Singapore)
# ============================================================================
# Fargate pricing is ~10-15% higher in Singapore than us-east-1
FARGATE_VCPU_PER_HOUR = 0.04656   # per vCPU per hour (Singapore)
FARGATE_GB_PER_HOUR = 0.00511     # per GB per hour (Singapore)

# ============================================================================
# TASK SIZING ANALYSIS
# ============================================================================
print("\n" + "─" * 80)
print("1. ECS FARGATE TASK SIZING ANALYSIS")
print("─" * 80)

print("""
┌─────────────────────────────────────────────────────────────────────────────┐
│ AGENT LOOP PROCESS MEMORY/CPU PROFILE (per user session)                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Component                        │ Memory (MB)  │ CPU (cores)             │
│  ─────────────────────────────────┼──────────────┼─────────────            │
│  Agent orchestrator (Node/Python) │ 150-250      │ 0.1-0.3                │
│  LLM streaming handler           │ 50-100       │ 0.05-0.15              │
│  Tool execution sandbox           │ 100-200      │ 0.1-0.2                │
│  HTTP client connections (pool)   │ 30-50        │ 0.02-0.05              │
│  Message/context buffer           │ 100-300      │ negligible              │
│  ─────────────────────────────────┼──────────────┼─────────────            │
│  Subtotal per session             │ 430-900 MB   │ 0.27-0.70 vCPU        │
│                                                                             │
│  MCP Sidecar Servers (per task):                                           │
│  ─────────────────────────────────┼──────────────┼─────────────            │
│  Filesystem MCP server (Node.js)  │ 80-150       │ 0.05-0.1               │
│  Database MCP server              │ 50-100       │ 0.03-0.08              │
│  Git MCP server                   │ 60-120       │ 0.05-0.1               │
│  Web/fetch MCP server             │ 50-80        │ 0.03-0.05              │
│  Custom enterprise MCP servers    │ 100-200      │ 0.05-0.15              │
│  ─────────────────────────────────┼──────────────┼─────────────            │
│  MCP subtotal (shared per task)   │ 340-650 MB   │ 0.21-0.48 vCPU        │
│                                                                             │
│  CRITICAL INSIGHT: MCP servers are Node.js processes spawned via npx.      │
│  In server-side model, these CANNOT be 1:1 per user (too expensive).       │
│  Must be shared service pools or spawned on-demand with aggressive          │
│  lifecycle management.                                                      │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
""")

# Two MCP deployment strategies
print("MCP SERVER DEPLOYMENT STRATEGIES:")
print()
print("  Strategy 1: DEDICATED MCP per task (1-3 users share a task)")
print("    - Each Fargate task has sidecar MCP containers")
print("    - Better isolation, worse cost efficiency")
print("    - Task size: 4 vCPU / 8 GB RAM → serves 2-3 concurrent users")
print()
print("  Strategy 2: SHARED MCP service pool (recommended)")
print("    - MCP servers run as separate ECS services")
print("    - Agent tasks connect to MCP pool via internal ALB")
print("    - Better cost efficiency through multiplexing")
print("    - Agent task: 2 vCPU / 4 GB → serves 3-5 concurrent users")
print("    - MCP pool: separate scaling")

# ============================================================================
# COMPUTE COSTS
# ============================================================================
print("\n" + "─" * 80)
print("2. ECS FARGATE COMPUTE COSTS")
print("─" * 80)

results = {}

for scenario_key, s in SCENARIOS.items():
    concurrent = int(TOTAL_USERS * s["concurrent_ratio"])
    daily_active = int(TOTAL_USERS * s["daily_active_pct"])
    
    print(f"\n{'━' * 70}")
    print(f"  Scenario: {s['label']} ({concurrent} concurrent users)")
    print(f"{'━' * 70}")
    
    # === STRATEGY 2 (Shared MCP) - Recommended ===
    # Agent tasks: 2 vCPU, 4 GB each, handles 4 concurrent users
    users_per_agent_task = 4
    agent_task_vcpu = 2
    agent_task_gb = 4
    num_agent_tasks = -(-concurrent // users_per_agent_task)  # ceiling division
    # Add 25% headroom for burst
    num_agent_tasks_with_headroom = int(num_agent_tasks * 1.25)
    
    # MCP service pool: shared Node.js MCP servers
    # Each MCP service task: 2 vCPU, 4 GB, handles ~20 concurrent connections
    mcp_connections_per_task = 20
    num_mcp_tasks = -(-concurrent // mcp_connections_per_task)
    num_mcp_tasks = max(num_mcp_tasks, 3)  # minimum 3 for HA
    mcp_task_vcpu = 2
    mcp_task_gb = 4
    
    # Running hours calculation
    # Peak hours: 8 hours/day (9am-5pm SGT), scale down 60% off-peak
    peak_hours_per_day = 10
    off_peak_hours_per_day = 14
    peak_scale = 1.0
    off_peak_scale = 0.3  # 30% capacity off-peak
    
    effective_hours_per_day = (peak_hours_per_day * peak_scale + 
                                off_peak_hours_per_day * off_peak_scale)
    monthly_hours = effective_hours_per_day * s["active_days"]
    
    # Agent task costs
    agent_vcpu_cost = num_agent_tasks_with_headroom * agent_task_vcpu * FARGATE_VCPU_PER_HOUR * monthly_hours
    agent_mem_cost = num_agent_tasks_with_headroom * agent_task_gb * FARGATE_GB_PER_HOUR * monthly_hours
    agent_total = agent_vcpu_cost + agent_mem_cost
    
    # MCP pool costs  
    mcp_vcpu_cost = num_mcp_tasks * mcp_task_vcpu * FARGATE_VCPU_PER_HOUR * monthly_hours
    mcp_mem_cost = num_mcp_tasks * mcp_task_gb * FARGATE_GB_PER_HOUR * monthly_hours
    mcp_total = mcp_vcpu_cost + mcp_mem_cost
    
    # Frontend/API service (always-on): 3 tasks x 1 vCPU, 2 GB
    api_tasks = 3
    api_vcpu = 1
    api_gb = 2
    api_hours = 730  # always on
    api_vcpu_cost = api_tasks * api_vcpu * FARGATE_VCPU_PER_HOUR * api_hours
    api_mem_cost = api_tasks * api_gb * FARGATE_GB_PER_HOUR * api_hours
    api_total = api_vcpu_cost + api_mem_cost

    # Tool execution tasks (burst): short-lived tasks for shell commands, file ops
    # Average 30s per tool call, burst to separate task for isolation
    total_sessions_monthly = daily_active * s["sessions_per_day"] * s["active_days"]
    total_tool_calls = total_sessions_monthly * s["tool_calls_per_session"]
    tool_task_duration_hours = 30 / 3600  # 30 seconds
    # Fargate minimum billing: 1 minute
    tool_task_billed_hours = max(tool_task_duration_hours, 1/60)
    # Many tool calls handled in-process, only ~30% need separate task
    isolated_tool_calls = total_tool_calls * 0.30
    tool_vcpu = 0.5
    tool_gb = 1
    tool_vcpu_cost = isolated_tool_calls * tool_task_billed_hours * tool_vcpu * FARGATE_VCPU_PER_HOUR
    tool_mem_cost = isolated_tool_calls * tool_task_billed_hours * tool_gb * FARGATE_GB_PER_HOUR
    tool_total = tool_vcpu_cost + tool_mem_cost
    
    total_fargate = agent_total + mcp_total + api_total + tool_total
    
    print(f"\n  Concurrent users:          {concurrent}")
    print(f"  Daily active users:        {daily_active}")
    print(f"  Monthly sessions:          {total_sessions_monthly:,.0f}")
    print(f"  Monthly tool calls:        {total_tool_calls:,.0f}")
    print(f"  Effective hours/month:     {monthly_hours:.0f}h")
    print(f"")
    print(f"  Agent Tasks:               {num_agent_tasks_with_headroom} tasks × ({agent_task_vcpu} vCPU, {agent_task_gb} GB)")
    print(f"    vCPU cost:               ${agent_vcpu_cost:>10,.2f}")
    print(f"    Memory cost:             ${agent_mem_cost:>10,.2f}")
    print(f"    Subtotal:                ${agent_total:>10,.2f}")
    print(f"")
    print(f"  MCP Service Pool:          {num_mcp_tasks} tasks × ({mcp_task_vcpu} vCPU, {mcp_task_gb} GB)")
    print(f"    vCPU cost:               ${mcp_vcpu_cost:>10,.2f}")
    print(f"    Memory cost:             ${mcp_mem_cost:>10,.2f}")
    print(f"    Subtotal:                ${mcp_total:>10,.2f}")
    print(f"")
    print(f"  API/Frontend Service:      {api_tasks} tasks × ({api_vcpu} vCPU, {api_gb} GB) [always-on]")
    print(f"    Subtotal:                ${api_total:>10,.2f}")
    print(f"")
    print(f"  Tool Execution (burst):    {isolated_tool_calls:,.0f} isolated calls/month")
    print(f"    Subtotal:                ${tool_total:>10,.2f}")
    print(f"")
    print(f"  ┌──────────────────────────────────────────┐")
    print(f"  │ TOTAL FARGATE COMPUTE:   ${total_fargate:>10,.2f}/mo  │")
    print(f"  └──────────────────────────────────────────┘")
    
    results[scenario_key] = {
        "concurrent": concurrent,
        "daily_active": daily_active,
        "monthly_sessions": total_sessions_monthly,
        "monthly_tool_calls": total_tool_calls,
        "agent_tasks": num_agent_tasks_with_headroom,
        "mcp_tasks": num_mcp_tasks,
        "fargate_total": total_fargate,
        "agent_cost": agent_total,
        "mcp_cost": mcp_total,
        "api_cost": api_total,
        "tool_cost": tool_total,
    }

# Save for next script
with open("aws_cost_analysis/model_a_compute_results.json", "w") as f:
    json.dump(results, f, indent=2)

print("\n\nResults saved for aggregation.")
