# -*- coding: utf-8 -*-
"""
兴业证券化工品价格价差与历史分位数据导入脚本
=============================================
读取 Excel 数据，清洗并导入 SQLite 数据库 (data/commodities.db)
包含 20 年周度时序数据、全景历史分位与涨跌排行榜。
"""

import os
import sys
import sqlite3
import pandas as pd
import numpy as np
from pathlib import Path

EXCEL_PATH = r"C:\Users\vega_\Downloads\20260830-兴业证券-化工行业：化工品价格价差与库存开工数据库.xlsx"
DB_DIR = Path(__file__).resolve().parent.parent / "data"
DB_PATH = DB_DIR / "commodities.db"

def init_db(conn):
    cursor = conn.cursor()
    cursor.execute("PRAGMA journal_mode = WAL;")
    cursor.execute("PRAGMA synchronous = NORMAL;")

    # 1. 产品/指标元数据表
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS commodity_series (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        category TEXT NOT NULL,
        series_name TEXT NOT NULL,
        is_spread INTEGER DEFAULT 0,
        unit TEXT,
        UNIQUE(category, series_name)
    )
    """)
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_series_cat ON commodity_series(category);")

    # 2. 周度历史时序表
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS commodity_history (
        series_id INTEGER,
        date TEXT,
        value REAL,
        PRIMARY KEY (series_id, date),
        FOREIGN KEY(series_id) REFERENCES commodity_series(id)
    )
    """)
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_hist_date ON commodity_history(date);")

    # 3. 历史分位表
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS commodity_quantiles (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        category TEXT,
        product_name TEXT UNIQUE,
        price_percentile REAL,
        spread_percentile REAL,
        weekly_change REAL,
        updated_at TEXT
    )
    """)

    # 4. 涨跌榜单表
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS commodity_rankings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ranking_type TEXT,  -- 'price' 或 'spread'
        period TEXT,        -- '1w', '2w', '1m', '1q', '1y'
        rank INTEGER,
        product_name TEXT,
        change_rate REAL
    )
    """)

    conn.commit()

def import_time_series(xls, conn):
    cursor = conn.cursor()
    excluded_sheets = {
        '价格 价差 库存等指标汇总表', '涨跌幅更新', '价格价差涨跌数量', 
        '价格 价差涨跌幅榜', '装置开工率', '开工率', '价格 价差全景图-历史分位'
    }
    target_sheets = [s for s in xls.sheet_names if s not in excluded_sheets]
    print(f"[*] 正在解析产业链时序 Sheet，共 {len(target_sheets)} 个类别...")

    total_records = 0

    for sheet in target_sheets:
        try:
            # 兴业证券时序表头通常在第 1 行或第 2 行，通过搜索包含 '日期' 的行
            df_raw = pd.read_excel(xls, sheet_name=sheet, nrows=5)
            header_row = 0
            for idx, row in df_raw.iterrows():
                row_vals = [str(x) for x in row.values]
                if any('日期' in x for x in row_vals):
                    header_row = idx
                    break

            df = pd.read_excel(xls, sheet_name=sheet, header=header_row)
            date_col_candidates = [c for c in df.columns if '日期' in str(c)]
            if not date_col_candidates:
                continue

            date_col_name = date_col_candidates[0]
            date_series = pd.to_datetime(df[date_col_name], errors='coerce')
            valid_mask = date_series.notna()
            valid_df = df[valid_mask].copy()
            valid_df['clean_date'] = date_series[valid_mask].dt.strftime('%Y-%m-%d')

            for col in df.columns:
                col_str = str(col).strip()
                if col == date_col_name or col_str in ['图表', 'clean_date'] or col_str.startswith('Unnamed'):
                    continue

                is_spread = 1 if ('价差' in col_str or '毛利' in col_str or '裂解' in col_str) else 0

                cursor.execute("""
                INSERT OR IGNORE INTO commodity_series (category, series_name, is_spread)
                VALUES (?, ?, ?)
                """, (sheet, col_str, is_spread))

                cursor.execute("SELECT id FROM commodity_series WHERE category = ? AND series_name = ?", (sheet, col_str))
                row_res = cursor.fetchone()
                if not row_res:
                    continue
                series_id = row_res[0]

                records = []
                for _, row in valid_df.iterrows():
                    val = row[col]
                    if pd.notna(val) and isinstance(val, (int, float, np.number)):
                        records.append((series_id, row['clean_date'], float(val)))

                if records:
                    cursor.executemany("""
                    INSERT OR REPLACE INTO commodity_history (series_id, date, value)
                    VALUES (?, ?, ?)
                    """, records)
                    total_records += len(records)

            conn.commit()
            print(f"  - [{sheet}] 导入成功")
        except Exception as e:
            print(f"  ! [{sheet}] 导入异常: {e}")

    print(f"[*] 时序数据导入完毕，累计写入 {total_records} 条历史数据！")

def import_quantiles(xls, conn):
    print("[*] 正在解析历史分位表...")
    try:
        df = pd.read_excel(xls, sheet_name='价格 价差全景图-历史分位')
        cursor = conn.cursor()

        # 查找包含板块、产品、分位信息的列
        # 表头一般在 3~5 行
        cat_col, prod_col, p_pct_col, w_chg_col, s_pct_col = None, None, None, None, None

        for r in range(min(10, len(df))):
            row_str = [str(x) for x in df.iloc[r].values]
            for c_idx, val in enumerate(row_str):
                if '板块' in val or '大类' in val:
                    cat_col = c_idx
                elif '产品' in val or '品种' in val:
                    prod_col = c_idx
                elif '价格分位' in val:
                    p_pct_col = c_idx
                elif '周涨幅' in val or '1周涨幅' in val:
                    w_chg_col = c_idx
                elif '价差分位' in val:
                    s_pct_col = c_idx

        # 默认回退列位置 (兴业证券标准模板)
        if prod_col is None:
            cat_col, prod_col, p_pct_col, w_chg_col, s_pct_col = 25, 26, 27, 28, 29

        records = []
        start_row = 4
        for i in range(start_row, len(df)):
            try:
                category = df.iloc[i, cat_col] if cat_col < len(df.columns) else None
                product = df.iloc[i, prod_col] if prod_col < len(df.columns) else None
                price_pct = df.iloc[i, p_pct_col] if p_pct_col and p_pct_col < len(df.columns) else None
                weekly_chg = df.iloc[i, w_chg_col] if w_chg_col and w_chg_col < len(df.columns) else None
                spread_pct = df.iloc[i, s_pct_col] if s_pct_col and s_pct_col < len(df.columns) else None

                if pd.notna(product) and str(product).strip() and str(product).strip() != '产品':
                    p_val = float(price_pct) if pd.notna(price_pct) and isinstance(price_pct, (int, float, np.number)) else None
                    w_val = float(weekly_chg) if pd.notna(weekly_chg) and isinstance(weekly_chg, (int, float, np.number)) else None
                    s_val = float(spread_pct) if pd.notna(spread_pct) and isinstance(spread_pct, (int, float, np.number)) else None

                    cat_str = str(category).strip() if pd.notna(category) else "其他"
                    prod_str = str(product).strip()

                    records.append((cat_str, prod_str, p_val, s_val, w_val, "2026-08-28"))
            except Exception:
                continue

        cursor.executemany("""
        INSERT OR REPLACE INTO commodity_quantiles 
        (category, product_name, price_percentile, spread_percentile, weekly_change, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
        """, records)
        conn.commit()
        print(f"[*] 历史分位表导入成功，共写入 {len(records)} 个重点品种！")
    except Exception as e:
        print(f"[!] 分位表导入异常: {e}")

def import_rankings(xls, conn):
    print("[*] 正在解析价格涨跌幅排行榜...")
    try:
        df = pd.read_excel(xls, sheet_name='价格 价差涨跌幅榜')
        cursor = conn.cursor()

        # 查找榜单数据所在行 (一般从第 4 行开始是排名)
        # 一周涨幅: col 1, 2; 两周涨幅: col 3, 4; 一个月: col 5, 6; 一个季度: col 7, 8; 一年: col 9, 10
        records = []
        periods = [
            ('1w', 1, 2),
            ('2w', 3, 4),
            ('1m', 5, 6),
            ('1q', 7, 8),
            ('1y', 9, 10),
        ]

        for i in range(4, min(30, len(df))):
            rank_val = df.iloc[i, 0]
            if not (pd.notna(rank_val) and (isinstance(rank_val, int) or str(rank_val).isdigit())):
                continue
            rank_num = int(rank_val)

            for period_name, prod_idx, val_idx in periods:
                if prod_idx < len(df.columns) and val_idx < len(df.columns):
                    prod = df.iloc[i, prod_idx]
                    chg = df.iloc[i, val_idx]
                    if pd.notna(prod) and pd.notna(chg) and isinstance(chg, (int, float, np.number)):
                        records.append(('price', period_name, rank_num, str(prod).strip(), float(chg)))

        cursor.executemany("""
        INSERT INTO commodity_rankings (ranking_type, period, rank, product_name, change_rate)
        VALUES (?, ?, ?, ?, ?)
        """, records)
        conn.commit()
        print(f"[*] 涨跌榜单导入成功，共写入 {len(records)} 条排名记录！")
    except Exception as e:
        print(f"[!] 涨跌榜单导入异常: {e}")

def main():
    if not os.path.exists(EXCEL_PATH):
        print(f"[ERROR] 未找到 Excel 文件: {EXCEL_PATH}")
        sys.exit(1)

    DB_DIR.mkdir(parents=True, exist_ok=True)
    print(f"[*] 连接数据库: {DB_PATH}")
    conn = sqlite3.connect(str(DB_PATH))
    init_db(conn)

    print(f"[*] 正在打开 Excel 工作簿: {EXCEL_PATH} (可能需要约 10~20 秒)...")
    xls = pd.ExcelFile(EXCEL_PATH)

    import_time_series(xls, conn)
    import_quantiles(xls, conn)
    import_rankings(xls, conn)

    conn.close()
    print("[SUCCESS] 化工品全量数据库构建完成！")

if __name__ == "__main__":
    main()
