from datetime import datetime, timedelta
import csv
import json
import os

# --- Configuration ---
CSV_FILE_PATH = 'York Break-ins 2024_2025.csv'
OUTPUT_FOLDER = 'data'
# We will search for these headers case-insensitively
DATE_COLUMN_NAME = 'occurrence_date'
FSA_COLUMN_NAME = 'fsa'
MUNICIPALITY_COLUMN_NAME = 'municipality'
LATITUDE_COLUMN_NAME = 'latitude'
LONGITUDE_COLUMN_NAME = 'longitude'

def process_data():
    if not os.path.exists(OUTPUT_FOLDER):
        os.makedirs(OUTPUT_FOLDER)

    fsa_data = {}
    monthly_summary = {}
    yearly_summary = {}
    map_incidents = []
    row_count = 0
    processed_count = 0
    
    # Get the date 30 days ago from today for filtering
    thirty_days_ago = datetime.now() - timedelta(days=30)
    twelve_months_ago = datetime.now() - timedelta(days=365)

    print(f"Attempting to read data from {CSV_FILE_PATH}...")

    try:
        with open(CSV_FILE_PATH, mode='r', encoding='utf-8-sig') as infile:
            reader = csv.DictReader(infile)
            
            headers = [h.lower() for h in reader.fieldnames]
            actual_fsa_column = reader.fieldnames[headers.index(FSA_COLUMN_NAME.lower())]
            actual_date_column = reader.fieldnames[headers.index(DATE_COLUMN_NAME.lower())]
            actual_municipality_column = reader.fieldnames[headers.index(MUNICIPALITY_COLUMN_NAME.lower())]
            actual_lat_column = reader.fieldnames[headers.index(LATITUDE_COLUMN_NAME.lower())]
            actual_lon_column = reader.fieldnames[headers.index(LONGITUDE_COLUMN_NAME.lower())]

            print(f"Successfully found columns: '{actual_fsa_column}', '{actual_date_column}', '{actual_municipality_column}'")

            for row in reader:
                row_count += 1
                fsa = row.get(actual_fsa_column, '').strip()
                date_str = row.get(actual_date_column, '').strip()
                municipality = row.get(actual_municipality_column, '').strip()

                if not fsa or fsa == 'N/A' or not date_str or not municipality:
                    continue

                try:
                    date_obj = datetime.strptime(date_str, "%Y-%m-%d %H:%M:%S")
                except ValueError:
                    try:
                        date_obj = datetime.strptime(date_str, "%m/%d/%Y %I:%M:%S %p")
                    except ValueError:
                        print(f"Warning on row {row_count}: Could not parse date '{date_str}'. Skipping.")
                        continue
                
                # Add to monthly summary and map data if it's within the last 30 days
                if date_obj >= thirty_days_ago:
                    monthly_summary[municipality] = monthly_summary.get(municipality, 0) + 1
                    map_incidents.append({
                        "lat": float(row[actual_lat_column]),
                        "lon": float(row[actual_lon_column]),
                        "fsa": fsa,
                        "municipality": municipality
                    })

                # Add to yearly summary if it's within the last 12 months
                if date_obj >= twelve_months_ago:
                    yearly_summary[municipality] = yearly_summary.get(municipality, 0) + 1

                # Overwrite the original date with the new, standardized format for the JSON files
                row[actual_date_column] = date_obj.strftime("%Y-%m-%d %H:%M:%S")

                # Add to FSA data
                if fsa not in fsa_data:
                    fsa_data[fsa] = []
                fsa_data[fsa].append(row)
                processed_count += 1

    except FileNotFoundError:
        print(f"ERROR: The file was not found at {CSV_FILE_PATH}")
        return
    except ValueError:
        print(f"ERROR: A required column was not found in the CSV. Please check column names.")
        print(f"Detected headers: {reader.fieldnames}")
        return
    except Exception as e:
        print(f"An unexpected error occurred: {e}")
        return

    print(f"\nRead {row_count} total rows from CSV.")
    print(f"Successfully processed {processed_count} rows with valid data.")
    print(f"Found {len(fsa_data)} unique FSAs. Writing JSON files...")

    for fsa, records in fsa_data.items():
        output_path = os.path.join(OUTPUT_FOLDER, f"{fsa}.json")
        with open(output_path, 'w', encoding='utf-8') as outfile:
            json.dump(records, outfile, indent=2)
    
    # Write the summary file
    summary_output_path = os.path.join(OUTPUT_FOLDER, "monthly_summary.json")
    with open(summary_output_path, 'w', encoding='utf-8') as outfile:
        sorted_summary = sorted(monthly_summary.items(), key=lambda item: item[1], reverse=True)
        json.dump(dict(sorted_summary), outfile, indent=2)

    # Write York Region totals
    york_totals = {
        "monthly": sum(monthly_summary.values()),
        "yearly": sum(yearly_summary.values())
    }
    with open(os.path.join(OUTPUT_FOLDER, "york_totals.json"), "w", encoding="utf-8") as f:
        json.dump(york_totals, f, indent=2)

    # Write the map data file as GeoJSON
    geojson = {
        "type": "FeatureCollection",
        "features": [
            {
                "type": "Feature",
                "geometry": {
                    "type": "Point",
                    "coordinates": [incident["lon"], incident["lat"]]
                },
                "properties": {
                    "fsa": incident["fsa"],
                    "municipality": incident["municipality"]
                }
            }
            for incident in map_incidents
        ]
    }
    map_data_output_path = os.path.join(OUTPUT_FOLDER, "map_data.geojson")
    with open(map_data_output_path, 'w', encoding='utf-8') as outfile:
        json.dump(geojson, outfile, indent=2)


    print(f"\nSuccessfully created {len(fsa_data)} FSA JSON files, 1 summary file, and 1 map data file in the '{OUTPUT_FOLDER}' folder.")

if __name__ == '__main__':
    process_data()
