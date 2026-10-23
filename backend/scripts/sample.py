from pathlib import Path

print("Current working directory:", Path.cwd())

folder = Path("./backend/data/rainfall_data")
print("Folder exists:", folder.exists())


import xarray as xr


files = sorted(folder.glob("*.nc4"))

print("Number of files:", len(files))

for file in files:
    print("\nFile:", file.name)

    with xr.open_dataset(file) as ds:
        print(ds)
        print("\nVariables:", list(ds.data_vars))

        for var in ds.data_vars:
            print(
                var,
                "Units:", ds[var].attrs.get("units", "Not specified")
            )
