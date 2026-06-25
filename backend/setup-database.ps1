# SQL Server database setup and seeding script for TimeSeriesAnalyzerDb
$connectionString = "Server=localhost;Database=master;Trusted_Connection=True;"
$dbName = "TimeSeriesAnalyzerDb"

Write-Host "Connecting to SQL Server..." -ForegroundColor Cyan

$conn = New-Object System.Data.SqlClient.SqlConnection($connectionString)
try {
    $conn.Open()
} catch {
    Write-Error "Failed to connect to local SQL Server instance. Make sure SQL Server is running and you have Windows Authentication access."
    exit
}

# 1. Create database if it does not exist
Write-Host "Creating database '$dbName' if it does not exist..." -ForegroundColor Yellow
$cmd = $conn.CreateCommand()
$cmd.CommandText = @"
IF NOT EXISTS (SELECT name FROM sys.databases WHERE name = '$dbName')
BEGIN
    CREATE DATABASE [$dbName];
END
"@
$cmd.ExecuteNonQuery() > $null

$conn.Close()

# Connect to the new database
$conn.ConnectionString = "Server=localhost;Database=$dbName;Trusted_Connection=True;"
$conn.Open()

# 2. Create CallRecords table and index
Write-Host "Creating 'CallRecords' table and index..." -ForegroundColor Yellow
$cmd = $conn.CreateCommand()
$cmd.CommandText = @"
IF OBJECT_ID('CallRecords', 'U') IS NULL
BEGIN
    CREATE TABLE CallRecords (
        Timestamp DATETIME2 NOT NULL
    );
    CREATE INDEX IX_CallRecords_Timestamp ON CallRecords (Timestamp);
END
"@
$cmd.ExecuteNonQuery() > $null

# 3. Seed database if empty
$cmd.CommandText = "SELECT COUNT(*) FROM CallRecords"
$count = $cmd.ExecuteScalar()

if ($count -eq 0) {
    Write-Host "Seeding database with test call records (approx. 5 days of data)..." -ForegroundColor Yellow
    
    $random = New-Object System.Random
    $now = [DateTime]::UtcNow
    $timestamps = New-Object System.Collections.Generic.List[DateTime]

    # Generate 5 days of data with 2-minute steps
    for ($i = 5 * 24 * 60; $i -ge 0; $i -= 2) {
        $timestamp = $now.AddMinutes(-$i)
        
        $callsCount = $random.Next(1, 10)
        # Random spikes
        if ($random.NextDouble() -gt 0.98) {
            $callsCount = $random.Next(40, 70)
        }

        for ($c = 0; $c -lt $callsCount; $c++) {
            $secondsOffset = $random.Next(0, 59)
            $timestamps.Add($timestamp.AddSeconds($secondsOffset))
        }
    }

    # Insert in batches of 1000
    $batchSize = 1000
    for ($offset = 0; $offset -lt $timestamps.Count; $offset += $batchSize) {
        $batch = $timestamps | Select-Object -Skip $offset -First $batchSize
        
        $valueStrings = @()
        foreach ($t in $batch) {
            $valueStrings += "('$($t.ToString('yyyy-MM-dd HH:mm:ss.fff'))')"
        }
        
        $valuesSql = $valueStrings -join ", "
        $insertCmd = $conn.CreateCommand()
        $insertCmd.CommandText = "INSERT INTO CallRecords (Timestamp) VALUES $valuesSql"
        $insertCmd.ExecuteNonQuery() > $null
    }

    $cmd.CommandText = "SELECT COUNT(*) FROM CallRecords"
    $newCount = $cmd.ExecuteScalar()
    Write-Host "Successfully seeded database with $newCount call records!" -ForegroundColor Green
} else {
    Write-Host "Database already contains $count records. Seeding skipped." -ForegroundColor Yellow
}

$conn.Close()
Write-Host "Database setup complete." -ForegroundColor Green
