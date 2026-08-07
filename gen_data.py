#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""从源文件生成 data.js —— 题目 20 道 + 歌曲 100 首。

输入：
  /tmp/timu.txt    （题目.docx 提取的纯文本）
  /tmp/songs.csv   （图鉴与参数.xlsx Sheet1 导出的 CSV）
输出：
  ../data.js
"""
import csv
import json
import math
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "data.js")

TIMU = "/tmp/timu.txt"
SONGS = "/tmp/songs.csv"

AXES = [
    {"pos": "古典", "neg": "现代"},
    {"pos": "旁征博引", "neg": "通俗晓畅"},
    {"pos": "含蓄蕴藉", "neg": "直抒胸臆"},
    {"pos": "致密沉实", "neg": "空灵飘逸"},
    {"pos": "精心构架", "neg": "行云流水"},
]
POLE2AXIS = {}
for i, a in enumerate(AXES):
    POLE2AXIS[a["pos"]] = i
    POLE2AXIS[a["neg"]] = i

CN_NUM = "壹贰叁肆伍陆柒捌玖拾"

RE_TITLE = re.compile(r"^第([壹贰叁肆伍陆柒捌玖拾]+)题·(.+)$")
RE_OPT = re.compile(r"^([ABCD])[\.．]\s*(.+)$")
RE_SCORE = re.compile(r"^([ABCD])：主·(.+?)\s*\+(\d+)\s*/\s*副·(.+?)\s*\+(\d+)$")


def parse_questions():
    lines = [l.rstrip() for l in open(TIMU, encoding="utf-8")]
    lines = [l.strip() for l in lines if l.strip()]

    questions = []
    cur = None
    for l in lines:
        m = RE_TITLE.match(l)
        if m:
            if cur:
                questions.append(cur)
            cur = {"no": m.group(1), "title": m.group(2), "stem": None,
                   "opts": {}, "score": {}}
            continue
        if cur is None:
            continue  # 开场叙事，跳过
        m = RE_SCORE.match(l)
        if m:
            k, mp, mv, sp, sv = m.groups()
            cur["score"][k] = {
                "mainAxis": POLE2AXIS[mp], "main": int(mv),
                "subAxis": POLE2AXIS[sp], "sub": int(sv),
            }
            continue
        m = RE_OPT.match(l)
        if m and cur["stem"] is not None:
            cur["opts"][m.group(1)] = m.group(2)
            continue
        if cur["stem"] is None:
            cur["stem"] = l
    if cur:
        questions.append(cur)

    out = []
    for q in questions:
        opts = []
        for k in "ABCD":
            s = q["score"][k]
            opts.append({
                "key": k,
                "text": q["opts"][k],
                "mainAxis": s["mainAxis"], "main": s["main"],
                "subAxis": s["subAxis"], "sub": s["sub"],
            })
        out.append({"no": q["no"], "title": q["title"],
                    "stem": q["stem"], "options": opts})
    return out


def parse_songs():
    rows = [r for r in csv.reader(open(SONGS, encoding="utf-8"))
            if r and r[0].strip()]
    songs, example = [], None
    for r in rows[1:]:
        name = r[0].strip()
        vals = [int(float(x)) for x in r[1:6]]
        if name == "示例得分":
            example = {"vec": vals}
            continue
        item = {"name": name, "p": vals}
        if len(r) > 7 and r[6].strip():
            item["_d"] = float(r[6])
            item["_s"] = float(r[7].replace("%", ""))
        songs.append(item)
    return songs, example


def distance(u, s):
    return sum(math.sqrt(abs(u[i] - s[i])) for i in range(5))


def similarity(R):
    return math.exp((15 - R) / 6)


# ============================================================
# 【改动 1/4】新增：与前端 scoreAxes 完全一致的计分函数
#   原始线性累加后，对第一轴做 int(sqrt(v) * 10) 变换
# ============================================================
def score_axes(answers, questions):
    """与前端 JS scoreAxes 对齐：第一轴开方×10取整"""
    v = [0] * 5
    for i, key in enumerate(answers):
        if key is None:
            continue
        for o in questions[i]["options"]:
            if o["key"] == key:
                v[o["mainAxis"]] += o["main"]
                v[o["subAxis"]] += o["sub"]
                break
    v[0] = int(math.sqrt(v[0]) * 10)
    return v


def validate(questions, songs, example):
    errs = []
    if len(questions) != 20:
        errs.append("题目数 %d != 20" % len(questions))
    main_cnt = [0] * 5
    sub_cnt = [0] * 5
    for i, q in enumerate(questions, 1):
        if len(q["options"]) != 4:
            errs.append("第%d题选项数 != 4" % i)
        mv = sorted(o["main"] for o in q["options"])
        sv = sorted(o["sub"] for o in q["options"])
        if mv != [0, 5, 11, 16]:
            errs.append("第%d题主维度分值档位异常 %s" % (i, mv))
        if sv != [0, 3, 6, 9]:
            errs.append("第%d题副维度分值档位异常 %s" % (i, sv))
        ma = {o["mainAxis"] for o in q["options"]}
        sa = {o["subAxis"] for o in q["options"]}
        if len(ma) != 1:
            errs.append("第%d题主维度轴不唯一" % i)
        if len(sa) != 1:
            errs.append("第%d题副维度轴不唯一" % i)
        if ma == sa:
            errs.append("第%d题主副维度同轴" % i)
        main_cnt[list(ma)[0]] += 1
        sub_cnt[list(sa)[0]] += 1
        if not q["stem"]:
            errs.append("第%d题缺题干" % i)
    if main_cnt != [4] * 5:
        errs.append("各轴作主维度次数 %s != [4]*5" % main_cnt)
    if sub_cnt != [4] * 5:
        errs.append("各轴作副维度次数 %s != [4]*5" % sub_cnt)

    if len(songs) != 100:
        errs.append("歌曲数 %d != 100" % len(songs))
    for s in songs:
        if len(s["p"]) != 5 or any(not (0 <= v <= 100) for v in s["p"]):
            errs.append("歌曲参数越界: %s" % s["name"])

    # ============================================================
    # 【改动 2/4】新增：验证变换后第一轴仍在 0~100
    #   构造极端作答（全选第一轴贡献最大/最小的选项），
    #   经 score_axes 变换后检查范围
    # ============================================================
    max_ans = []
    min_ans = []
    for q in questions:
        best = max(q["options"], key=lambda o: (
            (o["main"] if o["mainAxis"] == 0 else 0) +
            (o["sub"] if o["subAxis"] == 0 else 0)
        ))
        worst = min(q["options"], key=lambda o: (
            (o["main"] if o["mainAxis"] == 0 else 0) +
            (o["sub"] if o["subAxis"] == 0 else 0)
        ))
        max_ans.append(best["key"])
        min_ans.append(worst["key"])

    v_max = score_axes(max_ans, questions)
    v_min = score_axes(min_ans, questions)
    if v_max[0] > 100:
        errs.append("变换后第一轴最大值 %d > 100" % v_max[0])
    if v_min[0] < 0:
        errs.append("变换后第一轴最小值 %d < 0" % v_min[0])
    print("  · 变换后第一轴范围: %d ~ %d" % (v_min[0], v_max[0]))

    # 用 Excel 示例向量逐首复算，比对「距离」「相似度」两列
    if example:
        u = example["vec"]
        checked = 0
        for s in songs:
            if "_d" not in s:
                continue
            R = distance(u, s["p"])
            k = similarity(R) * 100
            if abs(R - s["_d"]) > 0.01:
                errs.append("距离不符 %s: 算得%.4f Excel%.2f" % (s["name"], R, s["_d"]))
            if abs(k - s["_s"]) > 0.51:
                errs.append("相似度不符 %s: 算得%.2f%% Excel%.2f%%" % (s["name"], k, s["_s"]))
            checked += 1
        print("  · 与 Excel 逐行比对：%d 首" % checked)
    return errs


def main():
    questions = parse_questions()
    songs, example = parse_songs()

    print("解析完成：%d 题 / %d 首歌" % (len(questions), len(songs)))
    errs = validate(questions, songs, example)
    if errs:
        print("\n❌ 校验失败：")
        for e in errs:
            print("   -", e)
        sys.exit(1)
    print("✅ 全部校验通过：20题×4选项、分值档位、轴分布、100首歌参数、距离/相似度对齐 Excel")

    # ============================================================
    # 【改动 3/4】selfTest 基准使用变换后的向量计算 Top5
    #   Excel 中的示例得分是原始线性值，需先对第一轴做
    #   int(sqrt(v)*10) 变换，再算距离和排序，与前端对齐
    # ============================================================
    u_raw = example["vec"]
    u = u_raw[:]
    u[0] = int(math.sqrt(u[0]) * 10)

    rank = sorted(
        ({"name": s["name"], "R": distance(u, s["p"])} for s in songs),
        key=lambda x: x["R"])[:5]
    print("  · 示例向量(变换后) %s Top5：" % (u,))
    for r in rank:
        print("      %-12s 距离%.2f 相似度%.2f%%" %
              (r["name"], r["R"], min(similarity(r["R"]) * 100, 100)))

    for s in songs:
        s.pop("_d", None)
        s.pop("_s", None)

    # ============================================================
    # 【改动 4/4】payload 中 selfTest.userVector 改为变换后的向量
    #   确保前端 ?selftest=1 自测时使用的基准向量与后端一致
    # ============================================================
    payload = {
        "axes": AXES,
        "questions": questions,
        "songs": songs,
        "selfTest": {
            "userVector": u,
            "top5": [r["name"] for r in rank],
        },
    }

    body = json.dumps(payload, ensure_ascii=False, indent=1)
    js = (
        "/* ==========================================================\n"
        " * 古风TI · 听雨楼雅集 —— 数据文件（后台可直接修改）\n"
        " * 本文件由 build/gen_data.py 从《题目.docx》《图鉴与参数.xlsx》自动生成。\n"
        " *\n"
        " * 修改歌曲参数：直接编辑下方 songs 数组里的 p:[古典,旁征博引,含蓄蕴藉,致密沉实,精心构架]\n"
        " * 五个数值范围 0~100，代表该歌曲在各轴「正极」方向的强度。\n"
        " * 也可打开 index.html?admin=1 用可视化面板修改并导出本文件。\n"
        " * ========================================================== */\n"
        "window.GFTI_DATA = " + body + ";\n"
    )
    out = os.path.abspath(OUT)
    with open(out, "w", encoding="utf-8") as f:
        f.write(js)
    print("  · 已写入 %s（%.1f KB）" % (out, len(js.encode()) / 1024))


if __name__ == "__main__":
    main()